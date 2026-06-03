import { useEffect, useState, type ReactNode } from 'react';
import { getHealth, runWatch, type WatchResult } from '../api';
import { Database, ShieldAlert, Share2, FileText, ChevronRight, Dna, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type Stage = 'baseline' | 'withhold' | 'fire' | 'closed';

function stageFor(year: number): Stage {
  if (year < 2020) return 'baseline';
  if (year < 2023) return 'withhold';
  if (year < 2025) return 'fire';
  return 'closed';
}

const narration: Record<Stage, string> = {
  baseline: 'Diane is tested. The MLH1 variant is filed as uncertain. She is told "we\'ll let you know if it changes."',
  withhold: 'A single 1★ submission appears. A naïve watcher would fire a false alarm, Unravel withholds it.',
  fire: 'A ClinGen expert panel reclassifies the variant. Fivetran catches it, the agent confirms it, and the family lights up.',
  closed: 'Without Unravel, the loop stays open, and years later the daughter presents with a preventable-stage tumour.',
};

export default function AppDashboard() {
  const [year, setYear] = useState(2019);
  const [syncing, setSyncing] = useState(false);
  const [viewFhir, setViewFhir] = useState(false);
  const [backend, setBackend] = useState<'checking' | 'online' | 'offline'>('checking');
  const [watch, setWatch] = useState<WatchResult | null>(null);

  const stage = stageFor(year);
  const fired = stage === 'fire' || stage === 'closed';
  const pct = ((year - 2019) / 7) * 100;

  // Ping the backend on mount so the UI reflects a real connection.
  useEffect(() => {
    getHealth().then(() => setBackend('online')).catch(() => setBackend('offline'));
  }, []);

  const onYear = (v: number) => {
    setYear(v);
    setSyncing(true);
    // Real round-trip to the backend; the local demo still works if it is offline.
    runWatch(v)
      .then(res => { setWatch(res); setBackend('online'); })
      .catch(() => setBackend('offline'))
      .finally(() => window.setTimeout(() => setSyncing(false), 400));
  };

  return (
    <div className="fade-in" style={{ padding: '2.5rem 0 4rem' }}>
      <div className="container">
        {/* header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.8rem' }}>
          <div>
            <div className="mono-tag"><span className="dash" /> Live simulator</div>
            <h1 className="display" style={{ fontSize: 'clamp(1.9rem,1rem+2.5vw,2.6rem)', margin: '.7rem 0 .4rem' }}>Evidence watch, a time machine</h1>
            <p style={{ color: 'var(--muted)' }}>Drag the year. Watch the evidence change, the agent reason, and the loop close.</p>
          </div>
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            <div className="pill">
              <Database size={15} color="var(--thread)" />
              <span className="mono" style={{ fontWeight: 600, color: 'var(--ink)' }}>FIVETRAN: {syncing ? 'SYNCING' : 'IDLE'}</span>
              <span className={syncing ? 'pulsing' : ''} style={{ width: 8, height: 8, borderRadius: 9, background: syncing ? 'var(--thread)' : 'var(--line-2)' }} />
            </div>
            <div className="pill" title={watch ? `backend decision: ${watch.decision}` : undefined}>
              <span className="mono" style={{ fontWeight: 600, color: 'var(--ink)' }}>
                API: {backend === 'checking' ? '…' : backend === 'online' ? 'CONNECTED' : 'OFFLINE'}
              </span>
              <span style={{ width: 8, height: 8, borderRadius: 9, background: backend === 'online' ? 'var(--benign, #1a7f5a)' : backend === 'offline' ? 'var(--path-d, #c0392b)' : 'var(--line-2)' }} />
            </div>
          </div>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px', gap: '1.5rem', alignItems: 'start' }} className="grid-2">
          {/* LEFT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* time machine */}
            <div className="card" style={{ padding: '1.6rem 1.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '.9rem', marginBottom: '.2rem' }}>
                <Clock size={18} color="var(--thread)" />
                <span style={{ fontFamily: 'var(--serif)', fontSize: '2rem', fontWeight: 600 }}>{year}</span>
                <span style={{ fontSize: '.9rem', color: 'var(--muted)' }}>{narration[stage]}</span>
              </div>
              <input
                type="range" className="thread-range" min={2019} max={2026} step={1} value={year}
                onChange={e => onYear(Number(e.target.value))}
                style={{ ['--p' as string]: `${pct}%`, marginTop: '1rem' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: 'var(--faint)', marginTop: '.5rem' }}>
                <span>2019</span><span>2021</span><span>2023</span><span>2025</span>
              </div>
            </div>

            {/* patient + variant */}
            <div className="card" style={{ padding: '1.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '1.3rem', marginBottom: '1.3rem', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <div style={{ fontSize: '.72rem', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--blue)', marginBottom: '.4rem' }}>FHIR R4 · Patient registry</div>
                  <h3 style={{ fontSize: '1.4rem' }}>Diane O. · 44</h3>
                  <p style={{ color: 'var(--muted)', fontSize: '.95rem' }}>Breast cancer (mastectomy, 2019) · pedigree: daughter 22, sister 49</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono" style={{ fontSize: '.7rem', color: 'var(--faint)' }}>LAST ENCOUNTER</div>
                  <div style={{ fontWeight: 600 }}>Oct 2019</div>
                </div>
              </div>

              <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '1.3rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '.7rem', flexWrap: 'wrap' }}>
                  <span className="mono" style={{ fontSize: '1.05rem', fontWeight: 600 }}>MLH1 c.1852_1854del</span>
                  <span className={`badge ${fired ? 'badge-path' : 'badge-vus'}`}>{fired ? 'Likely pathogenic' : 'VUS'}</span>
                </div>
                <div style={{ fontSize: '.82rem', color: 'var(--muted)', marginBottom: '1rem' }} className="mono">
                  ClinVar VCV000123456 · review status: {stage === 'baseline' ? '1★ single submitter' : stage === 'withhold' ? '1★ + 1 conflicting submission' : '3★ ClinGen expert panel'}
                </div>

                {/* adjudication note */}
                {stage === 'withhold' ? (
                  <NoteBox tone="amber" label="Adjudicator · withheld">
                    A single low-confidence submission does not change management. Unravel holds, no alert fired.
                    <span style={{ color: 'var(--faint)' }}> This is the moment a rules engine would get wrong.</span>
                  </NoteBox>
                ) : fired ? (
                  <NoteBox tone="red" label="Adjudicator · actionable">
                    Reclassified by ClinGen expert panel. Consistent with Lynch syndrome, changes surveillance.
                    Cascade testing indicated for first-degree relatives.
                  </NoteBox>
                ) : (
                  <NoteBox tone="muted" label="Adjudicator · monitoring">
                    Variant of Uncertain Significance. Standard surveillance; no change to clinical management.
                  </NoteBox>
                )}
              </div>

              {/* family board */}
              <AnimatePresence>
                {fired && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                    <div style={{ marginTop: '1.3rem' }}>
                      <div style={{ fontSize: '.72rem', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--path-d)', marginBottom: '.6rem' }}>
                        Affected-family board · 2 relatives flagged
                      </div>
                      <FamilyRow name="Diane O. · 44" tag="proband" />
                      <FamilyRow name="Daughter · 22" tag="1st-degree · at-risk" hot />
                      <FamilyRow name="Sister · 49" tag="1st-degree · at-risk" hot last />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* RIGHT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <AnimatePresence>
              {fired && (
                <motion.div initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .96 }}
                  className="card" style={{ padding: '1.6rem', border: '1px solid #f0b8bd', background: 'linear-gradient(180deg,#ffffff,#fbe9ea)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', color: 'var(--path-d)', marginBottom: '.9rem' }}>
                    <ShieldAlert size={18} />
                    <span style={{ fontSize: '.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Loop closure · draft</span>
                  </div>
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '.5rem' }}>Recontact fan-out prepared</h3>
                  <p style={{ fontSize: '.9rem', color: 'var(--muted)', marginBottom: '1.1rem', lineHeight: 1.55 }}>
                    Drafted for the ordering clinician and each at-risk relative, never sent autonomously.
                  </p>

                  <div className="console" style={{ marginBottom: '1rem', background: '#fff', borderColor: '#f0c2c6' }}>
                    <Target name="Dr. Sarah Chen" role="Ordering MD" />
                    <Target name="Daughter, 22" role="1st-degree" hot />
                    <Target name="Sister, 49" role="1st-degree" hot last />
                  </div>

                  <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setViewFhir(v => !v)}>
                    <Share2 size={16} /> {viewFhir ? 'Hide FHIR draft' : 'View FHIR draft'}
                  </button>

                  <AnimatePresence>
                    {viewFhir && (
                      <motion.pre initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        className="code" style={{ marginTop: '.9rem' }}>{`{
  "resourceType": "Task",
  "intent": "proposal",
  "status": "draft",
  "code": "patient-recontact / cascade-testing",
  "for": { "reference": "Patient/diane-o" },
  "reasonCode": "MLH1 VUS -> Likely Pathogenic (ClinGen 3*)",
  "owner": { "reference": "Practitioner/genetics-counsellor" }
}`}</motion.pre>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>

            {/* agent log */}
            <div className="card" style={{ padding: '1.5rem', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '1.1rem' }}>
                <FileText size={18} color="var(--muted)" />
                <span style={{ fontWeight: 700, fontFamily: 'var(--serif)', fontSize: '1.1rem' }}>Agent log</span>
              </div>
              <div className="console">
                {logFor(stage).map((l, i) => (
                  <div key={i} className="log-line" style={{ color: l.c, marginBottom: '.55rem' }}>{l.t}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- helpers ---- */

function NoteBox({ tone, label, children }: { tone: 'amber' | 'red' | 'muted'; label: string; children: ReactNode }) {
  const map = {
    amber: { bg: 'var(--vus-bg)', bd: '#ecd29a', fg: 'var(--vus)' },
    red: { bg: 'var(--path-bg)', bd: '#f0b8bd', fg: 'var(--path-d)' },
    muted: { bg: '#fff', bd: 'var(--line)', fg: 'var(--muted)' },
  }[tone];
  return (
    <div style={{ background: map.bg, border: `1px solid ${map.bd}`, borderRadius: 'var(--r-sm)', padding: '.9rem 1rem' }}>
      <div style={{ fontSize: '.68rem', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: map.fg, marginBottom: '.35rem' }}>{label}</div>
      <div style={{ fontSize: '.9rem', color: 'var(--ink)', lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

function FamilyRow({ name, tag, hot, last }: { name: string; tag: string; hot?: boolean; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.6rem .9rem', marginBottom: last ? 0 : '.5rem',
      background: hot ? 'var(--path-soft)' : 'var(--paper)', border: `1px solid ${hot ? '#f0b8bd' : 'var(--line)'}`, borderRadius: 'var(--r-sm)',
      borderLeft: `3px solid ${hot ? 'var(--path)' : 'var(--line-2)'}` }}>
      <span style={{ fontSize: '.92rem', fontWeight: 600 }}><Dna size={13} style={{ verticalAlign: '-2px', marginRight: 6, color: hot ? 'var(--path)' : 'var(--faint)' }} />{name}</span>
      <span className="mono" style={{ fontSize: '.72rem', fontWeight: 600, color: hot ? 'var(--path-d)' : 'var(--muted)' }}>{tag}</span>
    </div>
  );
}

function Target({ name, role, hot, last }: { name: string; role: string; hot?: boolean; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.88rem', padding: '.5rem 0', borderBottom: last ? 'none' : '1px solid #f0c2c6' }}>
      <span style={{ fontWeight: 600 }}><ChevronRight size={13} style={{ verticalAlign: '-2px', color: 'var(--path)' }} /> {name}</span>
      <span className="mono" style={{ color: hot ? 'var(--path-d)' : 'var(--muted)', fontWeight: 600 }}>{role}</span>
    </div>
  );
}

function logFor(stage: Stage): { t: string; c: string }[] {
  if (stage === 'baseline') return [
    { t: '[2019] FIVETRAN: sync complete · 0 material changes to tracked variants', c: 'var(--muted)' },
    { t: '[2019] WATCHER: MLH1 registry entry stable · sleeping', c: 'var(--faint)' },
  ];
  if (stage === 'withhold') return [
    { t: '[2021] FIVETRAN: sync complete · 1 new submission on MLH1 c.1852_1854del', c: 'var(--muted)' },
    { t: '[2021] WATCHER: delta hit · escalating to Adjudicator', c: 'var(--ink)' },
    { t: '[2021] ADJUDICATOR: 1★ single submitter · low confidence · review status unchanged', c: 'var(--vus)' },
    { t: '[2021] ADJUDICATOR: WITHHOLD, not actionable · no alert fired', c: 'var(--vus)' },
  ];
  if (stage === 'fire') return [
    { t: '[2023] FIVETRAN: sync complete · 1,204 ClinVar delta rows', c: 'var(--muted)' },
    { t: '[2023] WATCHER: delta hit against FHIR registry (Patient: Diane)', c: 'var(--ink)' },
    { t: '[2023] ADJUDICATOR: VUS → LP · ClinGen 3★ · actionability tier raised', c: 'var(--blue)' },
    { t: '[2023] CASCADE: locating first-degree relatives in pedigree…', c: 'var(--gold)' },
    { t: '[2023] CASCADE: drafted FHIR Task + Communication (intent: proposal)', c: 'var(--path-d)' },
  ];
  return [
    { t: '[2025] STATUS: loop closed in 2023 · drafts awaiting clinician review', c: 'var(--muted)' },
    { t: '[2025] NOTE: without Unravel, no system would have re-checked Diane', c: 'var(--path-d)' },
  ];
}
