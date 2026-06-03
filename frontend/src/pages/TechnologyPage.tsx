import { Database, ScanSearch, GitMerge, ArrowRight, Boxes, HeartPulse } from 'lucide-react';
import { motion } from 'framer-motion';

const viewport = { once: true, margin: '-80px' };

const agents = [
  { icon: <Database size={22} color="var(--primary)" />, accent: 'var(--primary)', n: '01', name: 'The Watcher',
    badge: 'Deterministic', cls: 'badge-benign',
    desc: "Continuously-synced evidence feeds. Fivetran is this agent's heartbeat, auditable delta-detection against the clinic's historical VUS registry." },
  { icon: <ScanSearch size={22} color="var(--conflict)" />, accent: 'var(--conflict)', n: '02', name: 'The Adjudicator',
    badge: 'Gemini 3 Flash', cls: 'badge-conflict',
    desc: 'Decides whether a change truly alters management, weighting review status, resolving conflicts, applying ACMG logic, and withholding low-confidence flips.' },
  { icon: <GitMerge size={22} color="var(--path)" />, accent: 'var(--path)', n: '03', name: 'Cascade Coordinator',
    badge: 'Gemini 3.1 Pro', cls: 'badge-path',
    desc: 'On a confirmed upgrade, drafts the clinician alert and the cascade-testing fan-out to at-risk relatives from the FHIR pedigree. Draft-only.' },
];

const pipeline = ['Evidence feeds', 'Fivetran', 'BigQuery', 'Watcher', 'Adjudicator', 'Cascade', 'FHIR → EHR'];

const cmp: [string, boolean, boolean][] = [
  ['Detect evidence changed', false, true],
  ['Find who carries the variant', true, false],
  ['Reason over discordant evidence', false, false],
  ['Fan out to the at-risk family', false, false],
  ['Draft recontact / FHIR write-back', false, false],
  ['An autonomous agent (vs human tool)', false, false],
];

export default function TechnologyPage() {
  return (
    <div className="fade-in">
      {/* HEADER */}
      <section className="sec" style={{ paddingBottom: 'clamp(2rem,1rem+3vw,3rem)' }}>
        <div className="wrapX" style={{ maxWidth: '900px' }}>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55 }}>
            <div className="mono-tag"><span className="dash" /> Architecture</div>
            <h1 className="display display-fluid" style={{ margin: '1.3rem 0 1.4rem', maxWidth: '14ch' }}>
              Code-first. Auditable. <span className="emph-b">Agentic.</span>
            </h1>
            <p className="body-lg" style={{ maxWidth: '62ch' }}>
              Built within the Google Cloud Agent Builder ecosystem with the Agent Development Kit, a multi-agent system
              powered by Gemini 3, with Fivetran as the evidence heartbeat and FHIR R4 as the clinical seam.
            </p>
          </motion.div>
        </div>
      </section>

      {/* LEGEND */}
      <section style={{ paddingBottom: 'clamp(2rem,1rem+3vw,3rem)' }}>
        <div className="wrapX">
          <div className="card" style={{ padding: '1.1rem 1.5rem' }}>
            <div className="legend">
              <span className="item mono-tag" style={{ color: 'var(--ink)' }}>Color code · ClinVar / UCSC</span>
              <span className="item"><span className="swatch" style={{ background: 'var(--vus)' }} /> VUS</span>
              <span className="item"><span className="swatch" style={{ background: 'var(--path)' }} /> Pathogenic</span>
              <span className="item"><span className="swatch" style={{ background: 'var(--benign)' }} /> Benign</span>
              <span className="item"><span className="swatch" style={{ background: 'var(--conflict)' }} /> Conflicting</span>
              <span className="item"><span className="swatch" style={{ background: 'var(--grey)' }} /> Not provided</span>
            </div>
          </div>
        </div>
      </section>

      {/* AGENTS as tiles */}
      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="wrapX">
          <div className="mono-tag"><span className="dash" /> The agents · 01</div>
          <h2 className="display display-mid" style={{ margin: '1rem 0 2.4rem', maxWidth: '20ch' }}>Three roles, three clocks.</h2>
          <motion.div className="tiles-3" initial="h" whileInView="s" viewport={viewport} variants={{ h: {}, s: { transition: { staggerChildren: .12 } } }}>
            {agents.map(a => (
              <motion.div key={a.n} className="tile" variants={{ h: { opacity: 0, y: 20 }, s: { opacity: 1, y: 0 } }} transition={{ duration: .5 }}>
                <div className="chip" style={{ marginBottom: '1.2rem' }}>{a.icon}</div>
                <div className="mono-tag" style={{ color: a.accent }}>Agent · {a.n}</div>
                <h3 className="display" style={{ fontSize: '1.5rem', margin: '.5rem 0 .7rem' }}>{a.name}</h3>
                <p style={{ color: 'var(--muted)', marginBottom: '1.2rem' }}>{a.desc}</p>
                <span className={`badge ${a.cls}`} style={{ alignSelf: 'flex-start', marginTop: 'auto' }}>{a.badge}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* PIPELINE */}
      <section className="sec" style={{ background: 'var(--paper-2)', borderTop: '1px solid var(--line)' }}>
        <div className="wrapX">
          <div className="mono-tag"><span className="dash" /> The loop · 02</div>
          <h2 className="display display-mid" style={{ margin: '1rem 0 2rem', maxWidth: '20ch' }}>Evidence → patient → family.</h2>
          <div className="flow">
            {pipeline.map((p, i) => (
              <div key={p} style={{ display: 'contents' }}>
                <div className="flow-step center" style={{ fontWeight: 600, fontSize: '.9rem' }}>{p}</div>
                {i < pipeline.length - 1 && <div className="flow-arrow hide-sm"><ArrowRight size={16} /></div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SEAMS */}
      <section className="sec">
        <div className="wrapX">
          <div className="mono-tag"><span className="dash" /> The seams · 03</div>
          <h2 className="display display-mid" style={{ margin: '1rem 0 2.2rem', maxWidth: '24ch' }}>Where the agent meets the world.</h2>
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.4rem' }}>
            <div className="tile">
              <div style={{ display: 'flex', gap: '.8rem', alignItems: 'center', marginBottom: '.9rem' }}>
                <Boxes size={22} color="var(--primary)" /><h3 className="display" style={{ fontSize: '1.4rem' }}>The Fivetran seam</h3>
              </div>
              <p style={{ color: 'var(--muted)' }}>Fivetran syncs the evidence feeds into BigQuery. The ADK agent calls the Fivetran MCP server to check freshness, trigger targeted re-syncs, and read sync history as the change signal, multiple MCP operations woven into its reasoning, not a single token call.</p>
            </div>
            <div className="tile">
              <div style={{ display: 'flex', gap: '.8rem', alignItems: 'center', marginBottom: '.9rem' }}>
                <HeartPulse size={22} color="var(--path)" /><h3 className="display" style={{ fontSize: '1.4rem' }}>The clinical seam · FHIR R4</h3>
              </div>
              <p style={{ color: 'var(--muted)' }}>Like Tracer, but inverted: Unravel fires when external evidence changes, reads the FHIR patient registry, and writes <span className="mono" style={{ fontSize: '.85em' }}>draft</span> resources (Task, Communication) back via the EHR webhook pattern, <code>intent: proposal</code>, no EHR modification.</p>
            </div>
          </div>
        </div>
      </section>

      {/* PRIOR ART */}
      <section className="sec" style={{ background: 'var(--paper-2)', borderTop: '1px solid var(--line)' }}>
        <div className="wrapX">
          <div className="mono-tag"><span className="dash" /> The edge · 04</div>
          <h2 className="display display-mid" style={{ margin: '1rem 0 .8rem', maxWidth: '22ch' }}>Prior tools own one link. Unravel owns the loop.</h2>
          <p className="body-lg" style={{ maxWidth: '46ch', marginBottom: '2rem' }}>
            We acknowledge them openly, and close the gap they both leave: the family.
          </p>
          <div className="card" style={{ padding: '1.4rem', overflowX: 'auto' }}>
            <table className="cmp">
              <thead>
                <tr>
                  <th>Capability</th>
                  <th>iVar <span style={{ color: 'var(--faint)', fontWeight: 400 }}>(lab DB)</span></th>
                  <th>VUSVista <span style={{ color: 'var(--faint)', fontWeight: 400 }}>(curation)</span></th>
                  <th className="u">Unravel</th>
                </tr>
              </thead>
              <tbody>
                {cmp.map(([cap, a, b]) => (
                  <tr key={cap}>
                    <td>{cap}</td>
                    <td className={a ? 'yes' : 'no'}>{a ? '✓' : '✗'}</td>
                    <td className={b ? 'yes' : 'no'}>{b ? '✓' : '✗'}</td>
                    <td className="u yes">✓</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="body-lg" style={{ fontStyle: 'italic', marginTop: '1.2rem', maxWidth: '46rem' }}>
            iVar tells a lab <strong style={{ color: 'var(--ink)' }}>who</strong> carries a variant. VUSVista tells a curator <strong style={{ color: 'var(--ink)' }}>when</strong> the evidence moved. Unravel does both, then drafts the recontact, for the patient and the at-risk family, that no one else is built to send.
          </p>
        </div>
      </section>

      {/* COMPLIANCE */}
      <section className="sec" style={{ paddingTop: 'clamp(3rem,2rem+3vw,4.5rem)' }}>
        <div className="wrapX">
          <div className="card" style={{ padding: '1.5rem 1.8rem', display: 'flex', flexWrap: 'wrap', gap: '.6rem', alignItems: 'center', justifyContent: 'center' }}>
            <span className="mono-tag" style={{ color: 'var(--muted)', marginRight: '.4rem' }}>Built with</span>
            {['Gemini 3', 'Google ADK', 'Cloud Run', 'BigQuery', 'FHIR R4', 'Fivetran MCP', 'Firebase Hosting'].map(t => (
              <span key={t} className="pill"><span className="dot" /> {t}</span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
