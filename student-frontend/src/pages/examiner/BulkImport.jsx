import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listExams, importStudents, importQuestions } from '../../api/examiner'
import { Spinner, cx } from '../../components/ui'

// ── templates ─────────────────────────────────────────────────────────────────
const TEMPLATES = {
  students_csv: `name,roll_number,email
Hamza Ali,FA22-BSE-001,hamza@exam.test
Maryam Iqbal,FA22-BSE-002,maryam@exam.test
Bilal Ahmed,FA22-BSE-003,bilal@exam.test`,
  questions_csv: `type,category,difficulty,text,marks
mcq,Data Structures,easy,"Which data structure uses LIFO?",2
short,Algorithms,medium,"Explain the divide and conquer strategy in 2–3 sentences.",4
multi,OOP,easy,"Select all pillars of OOP.",3`,
  questions_json: JSON.stringify([
    { type: 'mcq', category: 'Data Structures', difficulty: 'easy', text: 'Which data structure uses LIFO?', marks: 2, options: ['Queue', 'Stack', 'Heap', 'Graph'], answer: 1 },
    { type: 'short', category: 'Algorithms', difficulty: 'medium', text: 'Explain divide and conquer in 2–3 sentences.', marks: 4 },
  ], null, 2),
}

function downloadTemplate(name, type) {
  const content = TEMPLATES[name]
  const mime = type === 'json' ? 'application/json' : 'text/csv'
  const ext = type === 'json' ? 'json' : 'csv'
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `${name}.${ext}`; a.click()
  URL.revokeObjectURL(url)
}

// ── drop zone ─────────────────────────────────────────────────────────────────
function DropZone({ onFile, accept, label, icon }) {
  const ref = useRef(null)
  const [dragging, setDragging] = useState(false)
  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={`Upload ${label}`}
      onClick={() => ref.current?.click()}
      onKeyDown={(e) => e.key === 'Enter' && ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
      className={cx(
        'border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer select-none transition-all duration-200',
        dragging ? 'border-[#1e3a5f] bg-slate-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50',
      )}
    >
      <input ref={ref} type="file" accept={accept} className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      <div className="text-4xl mb-3">{icon}</div>
      <p className="font-semibold text-[#0f172a] text-sm">{label}</p>
      <p className="text-slate-400 text-xs mt-1">Drag & drop or click to browse</p>
      <p className="text-slate-300 text-xs mt-0.5">CSV or JSON</p>
    </div>
  )
}

// ── result panel ──────────────────────────────────────────────────────────────
function ImportResult({ result }) {
  if (!result) return null
  const hasErrors = result.errors?.length > 0
  return (
    <div className={cx('rounded-2xl p-5 mt-4', hasErrors ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200')}>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">{hasErrors ? '⚠️' : '✅'}</span>
        <div>
          <p className={cx('font-semibold', hasErrors ? 'text-amber-800' : 'text-green-800')}>
            Import complete — {result.imported} record{result.imported !== 1 ? 's' : ''} imported
          </p>
          {hasErrors && <p className="text-amber-700 text-sm">{result.errors.length} row{result.errors.length !== 1 ? 's' : ''} had errors and were skipped</p>}
        </div>
      </div>
      {hasErrors && (
        <div className="bg-white/70 rounded-xl overflow-hidden border border-amber-100">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-amber-100/60 text-amber-700">
                <th className="text-left px-3 py-2 font-semibold">Row</th>
                <th className="text-left px-3 py-2 font-semibold">Error</th>
              </tr>
            </thead>
            <tbody>
              {result.errors.map((e, i) => (
                <tr key={i} className="border-t border-amber-50">
                  <td className="px-3 py-2 font-mono text-amber-600">#{e.row}</td>
                  <td className="px-3 py-2 text-amber-700">{e.msg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── file preview ──────────────────────────────────────────────────────────────
function FilePreview({ content, fileType }) {
  const [expanded, setExpanded] = useState(false)
  const lines = content.split('\n')
  const shown = expanded ? lines : lines.slice(0, 8)
  const isJSON = fileType === 'json'

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">File Preview</p>
        <span className="text-xs text-slate-400">{lines.length} rows</span>
      </div>
      <pre className={cx(
        'bg-slate-900 text-green-300 rounded-xl p-4 text-xs overflow-x-auto leading-relaxed font-mono',
        expanded ? 'max-h-64 overflow-y-auto' : 'max-h-40 overflow-hidden relative',
      )}>
        {isJSON ? JSON.stringify(JSON.parse(content), null, 2).split('\n').slice(0, expanded ? 999 : 20).join('\n') : shown.join('\n')}
        {!expanded && lines.length > 8 && <span className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-slate-900 to-transparent flex items-end justify-center pb-2 text-slate-400 not-prose">···</span>}
      </pre>
      {lines.length > 8 && (
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-sky-600 hover:text-sky-800 mt-1 font-medium">
          {expanded ? '↑ Show less' : `↓ Show all ${lines.length} rows`}
        </button>
      )}
    </div>
  )
}

// ── import section ────────────────────────────────────────────────────────────
function ImportSection({ title, icon, templates, onRun, hint, examSelector }) {
  const [preview, setPreview] = useState(null)
  const [fileType, setFileType] = useState('csv')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const handleFile = async (file) => {
    const ext = file.name.split('.').pop().toLowerCase()
    setFileType(ext === 'json' ? 'json' : 'csv')
    const text = await file.text()
    setPreview(text)
    setResult(null)
  }

  const run = async () => {
    if (!preview) return
    setBusy(true)
    setResult(null)
    try {
      const res = await onRun(preview, fileType)
      setResult(res)
      setPreview(null)
    } catch (e) {
      setResult({ imported: 0, errors: [{ row: '—', msg: e.message ?? 'Unknown error' }] })
    } finally { setBusy(false) }
  }

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <h2 className="text-base font-semibold text-[#0f172a]">{title}</h2>
        </div>
        <div className="flex gap-2">
          {templates.map(({ name, type, label }) => (
            <button key={name} onClick={() => downloadTemplate(name, type)}
              className="btn btn-ghost h-7 px-2.5 text-xs border-slate-200">⬇ {label}</button>
          ))}
        </div>
      </div>

      {examSelector}

      <DropZone onFile={handleFile} accept=".csv,.json,text/csv,application/json" label={`Drop ${title} file here`} icon={icon} />

      {preview && (
        <>
          <FilePreview content={preview} fileType={fileType} />
          <div className="flex gap-2 mt-3">
            <button onClick={run} disabled={busy} className="btn btn-acc h-10 flex-1">
              {busy ? <><Spinner /> Importing…</> : '⬆ Run Import'}
            </button>
            <button onClick={() => { setPreview(null); setResult(null) }} className="btn btn-ghost h-10 px-4 border-slate-200">Clear</button>
          </div>
        </>
      )}

      <ImportResult result={result} />

      <div className="border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Format requirements</p>
        <p className="text-sm text-slate-500 leading-relaxed">{hint}</p>
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function BulkImport() {
  const { data: exams = [] } = useQuery({ queryKey: ['examiner', 'exams'], queryFn: listExams })
  const draftExams = exams.filter((e) => e.status === 'draft' || e.status === 'published')
  const [enrollExam, setEnrollExam] = useState('')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0f172a]">Bulk Import</h1>
        <p className="text-slate-500 mt-1">Import students and questions in bulk using CSV or JSON files.</p>
      </div>

      {/* tips banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
        <span className="text-lg shrink-0">💡</span>
        <div className="text-sm text-blue-700 space-y-1">
          <p><strong>Tips:</strong> Download the template, fill it in your spreadsheet, save as "CSV UTF-8" or JSON, then upload. Row numbers in error reports include the header (row 1).</p>
          <p>Duplicate roll numbers are matched to existing students instead of creating duplicates.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* students import */}
        <ImportSection
          title="Student Import"
          icon="👥"
          templates={[{ name: 'students_csv', type: 'csv', label: 'CSV template' }]}
          hint="Required columns: name, roll_number. Optional: email. Enroll to a specific exam or add to system only."
          examSelector={
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Enroll to Exam (optional)</label>
              <select value={enrollExam} onChange={(e) => setEnrollExam(e.target.value)} className="field bg-slate-50 text-sm">
                <option value="">— Add to system only —</option>
                {draftExams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </div>
          }
          onRun={(text) => importStudents(enrollExam || null, text)}
        />

        {/* questions import */}
        <ImportSection
          title="Question Import"
          icon="❓"
          templates={[
            { name: 'questions_csv', type: 'csv', label: 'CSV' },
            { name: 'questions_json', type: 'json', label: 'JSON' },
          ]}
          hint="CSV columns: type (mcq|multi|short), category, difficulty (easy|medium|hard), text, marks. JSON: array of question objects. Options and answers can be edited in the Question Bank after import."
          onRun={(text, fileType) => {
            if (fileType === 'json') {
              try {
                const parsed = JSON.parse(text)
                const csv = ['type,category,difficulty,text,marks',
                  ...parsed.map((q) => [q.type, q.category ?? '', q.difficulty ?? 'medium', `"${(q.text ?? '').replace(/"/g, '""')}"`, q.marks ?? 2].join(','))
                ].join('\n')
                return importQuestions(csv)
              } catch {
                return Promise.reject(new Error('Invalid JSON format'))
              }
            }
            return importQuestions(text)
          }}
        />
      </div>
    </div>
  )
}
