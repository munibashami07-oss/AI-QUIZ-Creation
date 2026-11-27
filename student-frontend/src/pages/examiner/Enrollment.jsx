import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listExams, getEnrollment, enrollStudent, unenrollStudent, getAttendance, markAttendance } from '../../api/examiner'
import { Empty, Modal, Skeleton, Spinner, Switch, cx } from '../../components/ui'

const STATUS_BADGE = {
  draft: 'bg-slate-100 text-slate-600',
  published: 'bg-sky-100 text-sky-700',
  ongoing: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
}

export default function Enrollment() {
  const qc = useQueryClient()
  const { data: exams = [], isLoading: loadingExams } = useQuery({ queryKey: ['examiner', 'exams'], queryFn: listExams })
  const [selectedExam, setSelectedExam] = useState(null)
  const [tab, setTab] = useState('enrollment') // 'enrollment' | 'attendance'
  const [search, setSearch] = useState('')
  const [enrollModal, setEnrollModal] = useState(false)

  const exam = exams.find((e) => e.id === selectedExam)

  const { data: enrollData, isLoading: loadingEnroll, refetch: refetchEnroll } = useQuery({
    queryKey: ['examiner', 'enrollment', selectedExam],
    queryFn: () => getEnrollment(selectedExam),
    enabled: !!selectedExam,
  })

  const { data: attendance = {}, refetch: refetchAtt } = useQuery({
    queryKey: ['examiner', 'attendance', selectedExam],
    queryFn: () => getAttendance(selectedExam),
    enabled: !!selectedExam && tab === 'attendance',
  })

  const enrolled = enrollData?.enrolled ?? []
  const all = enrollData?.all ?? []
  const notEnrolled = all.filter((s) => !enrolled.some((e) => e.id === s.id))

  const enrollM = useMutation({
    mutationFn: (sid) => enrollStudent(selectedExam, sid),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['examiner', 'enrollment', selectedExam] }); qc.invalidateQueries({ queryKey: ['examiner', 'exams'] }) },
  })
  const unenrollM = useMutation({
    mutationFn: (sid) => unenrollStudent(selectedExam, sid),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['examiner', 'enrollment', selectedExam] }); qc.invalidateQueries({ queryKey: ['examiner', 'exams'] }) },
  })
  const attendM = useMutation({
    mutationFn: ({ sid, present }) => markAttendance(selectedExam, sid, present),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['examiner', 'attendance', selectedExam] }),
  })

  const filteredEnrolled = enrolled.filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.roll?.toLowerCase().includes(search.toLowerCase())
  )

  const attendanceRequired = exam?.attendance_required

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0f172a]">Enrollment & Attendance</h1>
        <p className="text-slate-500 mt-1">Manage which students can access each exam and mark attendance.</p>
      </div>

      {/* exam picker */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-6">
        <label className="block text-sm font-semibold text-slate-700 mb-2">Select Exam</label>
        {loadingExams ? (
          <Skeleton className="h-11 !bg-slate-100" />
        ) : (
          <select value={selectedExam ?? ''} onChange={(e) => { setSelectedExam(e.target.value || null); setSearch('') }}
            className="field bg-slate-50">
            <option value="">— Choose an exam —</option>
            {exams.map((e) => <option key={e.id} value={e.id}>{e.title} ({e.status})</option>)}
          </select>
        )}
      </div>

      {!selectedExam ? (
        <Empty title="No exam selected" hint="Choose an exam above to manage its enrollment and attendance." />
      ) : (
        <>
          {/* exam info banner */}
          <div className="bg-[#0f172a] text-white rounded-2xl px-6 py-4 mb-6 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={cx('text-xs font-semibold px-2 py-0.5 rounded-full', STATUS_BADGE[exam?.status])}>{exam?.status}</span>
                {attendanceRequired && <span className="text-xs text-amber-300 font-medium">· Attendance required</span>}
              </div>
              <h2 className="font-semibold text-lg leading-tight">{exam?.title}</h2>
            </div>
            <dl className="flex gap-6">
              <div><dt className="text-xs text-white/50">Enrolled</dt><dd className="font-bold text-xl">{enrolled.length}</dd></div>
              {attendanceRequired && (
                <div>
                  <dt className="text-xs text-white/50">Present</dt>
                  <dd className="font-bold text-xl">{enrolled.filter((s) => attendance[s.id] === true).length}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* attendance info box */}
          {attendanceRequired && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 flex items-start gap-3 text-sm text-amber-800">
              <span className="text-lg shrink-0">⚠️</span>
              <p>This exam requires attendance. Only students who are <strong>enrolled</strong> and marked <strong>present</strong> will be granted access when the exam opens.</p>
            </div>
          )}

          {/* tabs */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit mb-5">
            {[['enrollment', 'Enrollment'], ['attendance', 'Attendance']].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={cx('px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200',
                  tab === k ? 'bg-white text-[#0f172a] shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                {l}
              </button>
            ))}
          </div>

          {/* search */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or roll number…"
              className="field bg-white sm:max-w-sm" aria-label="Search students" />
            {tab === 'enrollment' && (
              <button onClick={() => setEnrollModal(true)} className="btn btn-acc h-11">+ Enroll Students</button>
            )}
            {tab === 'attendance' && attendanceRequired && enrolled.length > 0 && (
              <div className="flex gap-2 ml-auto">
                <button onClick={() => enrolled.forEach((s) => attendM.mutate({ sid: s.id, present: true }))}
                  className="btn h-9 px-4 text-sm bg-green-600 text-white hover:bg-green-700 font-semibold">Mark All Present</button>
                <button onClick={() => enrolled.forEach((s) => attendM.mutate({ sid: s.id, present: false }))}
                  className="btn btn-ghost h-9 px-4 text-sm border-slate-200">Clear All</button>
              </div>
            )}
          </div>

          {/* enrollment tab */}
          {tab === 'enrollment' && (
            loadingEnroll ? (
              <div className="grid gap-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 !bg-slate-100" />)}</div>
            ) : filteredEnrolled.length === 0 ? (
              <Empty title="No students enrolled" hint="Enroll students to allow them to take this exam."
                action={<button className="btn btn-acc" onClick={() => setEnrollModal(true)}>+ Enroll Students</button>} />
            ) : (
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                  <span className="text-xs font-medium text-slate-500">{filteredEnrolled.length} student{filteredEnrolled.length !== 1 ? 's' : ''}</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {filteredEnrolled.map((s, i) => (
                    <li key={s.id} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                      className="fade flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50/50 transition-colors">
                      <div className="h-9 w-9 rounded-full bg-[#1e3a5f]/10 text-[#1e3a5f] flex items-center justify-center text-sm font-bold shrink-0">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#0f172a]">{s.name}</p>
                        <p className="text-xs text-slate-400">{s.roll} · {s.email}</p>
                      </div>
                      <button
                        disabled={unenrollM.isPending}
                        onClick={() => unenrollM.mutate(s.id)}
                        className="btn btn-ghost h-8 px-3 text-xs text-rose-500 border-slate-200 hover:bg-rose-50 hover:border-rose-200">
                        {unenrollM.isPending ? <Spinner /> : 'Remove'}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}

          {/* attendance tab */}
          {tab === 'attendance' && (
            !attendanceRequired ? (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center text-slate-500">
                <p className="text-lg mb-1">📋</p>
                <p className="font-medium">Attendance not required</p>
                <p className="text-sm mt-1">This exam does not require attendance. All enrolled students can access it directly.</p>
              </div>
            ) : enrolled.length === 0 ? (
              <Empty title="No students enrolled" hint="Enroll students first to mark their attendance." />
            ) : (
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">{enrolled.length} enrolled · {enrolled.filter((s) => attendance[s.id] === true).length} present</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {enrolled.filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.roll?.toLowerCase().includes(search.toLowerCase())).map((s, i) => {
                    const present = attendance[s.id] === true
                    const marked = attendance[s.id] !== undefined
                    return (
                      <li key={s.id} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                        className={cx('fade flex items-center gap-4 px-4 py-3.5 transition-colors',
                          present ? 'bg-green-50/40' : marked ? 'bg-rose-50/30' : 'hover:bg-slate-50/50')}>
                        <div className={cx('h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors',
                          present ? 'bg-green-100 text-green-700' : marked ? 'bg-rose-100 text-rose-500' : 'bg-slate-100 text-slate-400')}>
                          {present ? '✓' : marked ? '✗' : s.name.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[#0f172a]">{s.name}</p>
                          <p className="text-xs text-slate-400">{s.roll}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={cx('text-xs font-semibold',
                            present ? 'text-green-600' : marked ? 'text-rose-500' : 'text-slate-400')}>
                            {present ? 'Present' : marked ? 'Absent' : 'Not marked'}
                          </span>
                          <Switch
                            checked={present}
                            onChange={(v) => attendM.mutate({ sid: s.id, present: v })}
                            label={`Mark ${s.name} ${present ? 'absent' : 'present'}`}
                          />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          )}
        </>
      )}

      {/* enroll modal */}
      <Modal open={enrollModal} onClose={() => setEnrollModal(false)} title="Enroll Students" wide>
        <p className="text-slate-500 text-sm mb-4">Select students to enroll in <strong className="text-[#0f172a]">{exam?.title}</strong>.</p>
        {notEnrolled.length === 0 ? (
          <p className="text-center text-slate-400 py-6 text-sm">All students are already enrolled.</p>
        ) : (
          <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto mb-4 border border-slate-100 rounded-xl">
            {notEnrolled.map((s) => (
              <li key={s.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#0f172a]">{s.name}</p>
                  <p className="text-xs text-slate-400">{s.roll} · {s.email}</p>
                </div>
                <button
                  disabled={enrollM.isPending}
                  onClick={() => enrollM.mutate(s.id)}
                  className="btn h-8 px-3 text-xs bg-[#1e3a5f] text-white hover:bg-[#162d4a] font-semibold">
                  {enrollM.isPending ? <Spinner /> : 'Enroll'}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end">
          <button className="btn btn-ghost border-slate-200" onClick={() => setEnrollModal(false)}>Done</button>
        </div>
      </Modal>
    </div>
  )
}
