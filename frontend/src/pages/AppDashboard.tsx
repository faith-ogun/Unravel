import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Database, Dna, Cpu, Box, Sparkles, Eye, Scale, GitBranch, Users, ShieldCheck,
  List, Network, UserPlus,
} from 'lucide-react';
import {
  getCohort, getFreshness, resync, runLoop, getStructural,
  type CohortRow, type Feed, type Adjudication, type ResolutionPlan,
  type CascadeResult, type StewardResult, type Structural,
} from '../api';
import PedigreeView from '../dash/PedigreeView';
import GraphView from '../dash/GraphView';
import AddPatientView from '../dash/AddPatientView';
import StructureViewer from '../dash/StructureViewer';
import PosteriorBreakdown from '../dash/PosteriorBreakdown';

type View = 'watchlist' | 'pedigree' | 'graph' | 'add';
const NAV: { id: View; label: string; icon: typeof List }[] = [
  { id: 'watchlist', label: 'Watchlist', icon: List },
  { id: 'pedigree', label: 'Pedigree', icon: Users },
  { id: 'graph', label: 'Graph', icon: Network },
  { id: 'add', label: 'Add patient', icon: UserPlus },
];

type NodeState = 'idle' | 'running' | 'done' | 'held';
interface LogLine { agent: string; text: string; tone: 'ok' | 'warn' | 'info'; }

const AGENTS = ['Watcher', 'Adjudicator', 'Planner', 'Cascade', 'Steward'] as const;
type Agent = typeof AGENTS[number];
const AGENT_ICON: Record<Agent, typeof Eye> = {
  Watcher: Eye, Adjudicator: Scale, Planner: GitBranch, Cascade: Users, Steward: ShieldCheck,
};
const SOURCE_ICON: Record<string, typeof Database> = {
  clinvar: Database, gnomad: Dna, alphamissense: Cpu, alphafold: Box, gemini: Sparkles,
};

function bandColor(band: string) {
  const b = (band || '').toLowerCase();
  if (b.includes('pathogenic')) return { fg: 'var(--path-d)', bg: 'var(--path-bg)' };
  if (b.includes('benign')) return { fg: 'var(--benign)', bg: 'var(--benign-bg)' };
  return { fg: 'var(--thread-d)', bg: 'var(--vus-bg)' };
}
function dirChip(dir: string) {
  if (dir === 'escalation') return { label: 'ESCALATION', fg: 'var(--path-d)', bg: 'var(--path-bg)', edge: 'var(--path)' };
  if (dir === 'downgrade') return { label: 'DOWNGRADE', fg: 'var(--benign)', bg: 'var(--benign-bg)', edge: 'var(--benign)' };
  if (dir === 'unchanged') return { label: 'STABLE', fg: 'var(--faint)', bg: 'var(--paper-2)', edge: 'var(--line-2)' };
  return { label: dir.toUpperCase(), fg: 'var(--muted)', bg: 'var(--paper-2)', edge: 'var(--line-2)' };
}
function yearsSince(date: string | null): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / (365.25 * 864e5)));
}

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14,
  padding: '1.1rem 1.2rem', boxShadow: 'var(--sh-sm)',
};
const mono = (s: React.CSSProperties = {}): React.CSSProperties => ({ fontFamily: 'var(--mono)', ...s });
const tag = (fg: string, bg: string): React.CSSProperties => ({
  display: 'inline-block', fontFamily: 'var(--mono)', fontSize: '.68rem', fontWeight: 600,
  padding: '.14rem .5rem', borderRadius: 6, color: fg, background: bg, letterSpacing: '.04em',
});
const eyebrow: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: '.66rem', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--faint)',
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function AppDashboard() {
  const [cohort, setCohort] = useState<CohortRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [feeds, setFeeds] = useState<Feed[] | null>(null);
  const [resyncing, setResyncing] = useState<string | null>(null);
  const [sel, setSel] = useState<CohortRow | null>(null);

  const [nodes, setNodes] = useState<Record<Agent, NodeState>>({
    Watcher: 'idle', Adjudicator: 'idle', Planner: 'idle', Cascade: 'idle', Steward: 'idle',
  });
  const [running, setRunning] = useState(false);
  const [view, setView] = useState<View>('watchlist');
  const [log, setLog] = useState<LogLine[]>([]);
  const [adj, setAdj] = useState<Adjudication | null>(null);
  const [plan, setPlan] = useState<ResolutionPlan | null>(null);
  const [casc, setCasc] = useState<CascadeResult | null>(null);
  const [stew, setStew] = useState<StewardResult | null>(null);
  const [struc, setStruc] = useState<Structural | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCohort().then(setCohort).catch((e) => setErr(String(e.message || e)));
    getFreshness().then(setFeeds).catch(() => setFeeds([]));
  }, []);
  useEffect(() => { logRef.current?.scrollTo({ top: 1e6 }); }, [log]);

  const push = (agent: string, text: string, tone: LogLine['tone'] = 'info') =>
    setLog((l) => [...l, { agent, text, tone }]);
  const setNode = (a: Agent, s: NodeState) => setNodes((n) => ({ ...n, [a]: s }));

  function selectPatient(r: CohortRow) {
    setSel(r);
    setNodes({ Watcher: 'idle', Adjudicator: 'idle', Planner: 'idle', Cascade: 'idle', Steward: 'idle' });
    setAdj(null); setPlan(null); setCasc(null); setStew(null); setStruc(null); setLog([]);
  }

  async function doResync(f: Feed) {
    setResyncing(f.schema);
    push('Fivetran', `triggering targeted re-sync of ${f.schema} via MCP...`, 'info');
    try {
      await resync(f.connection_id);
      push('Fivetran', `${f.schema} re-sync queued`, 'ok');
      setFeeds(await getFreshness());
    } catch (e) {
      push('Fivetran', `re-sync failed: ${e}`, 'warn');
    } finally {
      setResyncing(null);
    }
  }

  async function runWatch(target?: CohortRow) {
    const r = target ?? sel;
    if (!r || running) return;
    setRunning(true);
    setAdj(null); setPlan(null); setCasc(null); setStew(null); setLog([]);

    setNode('Watcher', 'running');
    push('Watcher', `${r.gene} ${r.hgvs_c}: registry "${r.recorded_class}" vs ClinVar "${r.current_class}" (${r.review_stars}★) — running the five-agent loop on Gemini…`, 'info');

    let loop;
    try {
      loop = await runLoop(r.patient_id);
    } catch (e) {
      push('Watcher', `error: ${e}`, 'warn'); setNode('Watcher', 'held'); setRunning(false); return;
    }

    // Watcher
    push('Watcher', loop.watch?.summary || 'change triaged for adjudication', 'ok');
    setNode('Watcher', 'done'); await sleep(250);

    // Adjudicator (the moat)
    setNode('Adjudicator', 'running'); await sleep(220);
    const v = loop.verdict;
    setAdj({ patient_id: r.patient_id, reclassified: true, verdict: { triage: v.triage, action: v.action, withheld: v.withheld, rationale: v.rationale, key_evidence: [] } } as Adjudication);
    push('Adjudicator', `verdict: ${v.triage} · ${v.action}${v.withheld ? ' · WITHHELD' : ''}`, v.withheld ? 'warn' : 'ok');
    setNode('Adjudicator', 'done'); await sleep(250);

    // fan-out: Planner ‖ Cascade ‖ Steward (ran in parallel server-side)
    setNode('Planner', 'running'); await sleep(180);
    setPlan({ recommendation: loop.plan?.recommendation || '', steps: [] } as unknown as ResolutionPlan);
    push('Planner', loop.plan?.recommendation || 'no resolving experiment found', 'ok');
    setNode('Planner', 'done'); await sleep(180);

    const actionable = v.action === 'draft_recontact' && !v.withheld && !!loop.cascade?.applicable;
    if (actionable) {
      setNode('Cascade', 'running'); await sleep(180);
      const drafts = (loop.cascade.drafts || []).map((d, i) => ({
        for: d.recipient, patient_id: d.recipient, relationship: d.relationship,
        communication: loop.fhir_drafts[i] as Record<string, unknown> | undefined,
        risk_assessment: undefined,
      }));
      setCasc({ variant: `${r.gene} ${r.hgvs_c}`, carriers: drafts.length, relatives: 0,
        deceased_carriers: [], drafts, note: 'Draft-only (intent: proposal, status: draft). A clinician reviews and sends.' } as CascadeResult);
      push('Cascade', `drafted ${drafts.length} clinician-facing recontact proposal(s)`, 'ok');
      setNode('Cascade', 'done');
    } else {
      setNode('Cascade', 'held');
      push('Cascade', 'held — verdict not actionable, no family recontact drafted', 'warn');
    }
    await sleep(180);

    // Steward
    setNode('Steward', 'running'); await sleep(180);
    const routes = loop.steward?.ethics_routes || [];
    setStew({ variant: `${r.gene} ${r.hgvs_c}`, has_deceased_carrier: routes.length > 0,
      ethics_routes: routes.map((e) => ({ deceased: e.deceased, route: e.route || 'ethics / next-of-kin consent pathway', rationale: '', living_relatives: e.living_relatives || [] })),
      give_back: { variant: `${r.gene} ${r.hgvs_c}`, submitted_classification: loop.steward?.give_back?.classification || r.current_class || '', evidence: [], gene: r.gene } } as StewardResult);
    if (routes.length > 0) push('Steward', 'deceased carrier — routed to ethics / next-of-kin pathway', 'warn');
    else push('Steward', 'drafted ClinVar give-back submission', 'ok');
    setNode('Steward', 'done');

    if (r.hgvs_p) getStructural(r.gene, r.hgvs_p).then(setStruc).catch(() => {});
    setRunning(false);
  }

  // deep link: /app?patient=<id>&run=1 selects a case and optionally runs the loop
  useEffect(() => {
    if (!cohort) return;
    const params = new URLSearchParams(window.location.search);
    const v = params.get('view');
    if (v && ['watchlist', 'pedigree', 'graph', 'add'].includes(v)) setView(v as View);
    const pid = params.get('patient');
    if (!pid) return;
    const row = cohort.find((r) => r.patient_id === pid);
    if (!row) return;
    selectPatient(row);
    if (params.get('run') === '1' && row.reclassified) setTimeout(() => runWatch(row), 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohort]);

  const flagged = cohort?.filter((r) => r.reclassified) ?? [];
  const escalations = flagged.filter((r) => r.direction === 'escalation');
  const maxSilent = Math.max(0, ...(cohort ?? []).map((r) => yearsSince(r.recorded_date) ?? 0));
  const pid = sel?.patient_id ?? 'diane-marchetti';
  const refreshCohort = () => getCohort().then(setCohort).catch(() => {});

  return (
    <main style={{ maxWidth: 1320, margin: '0 auto', padding: '1.4rem 1.6rem 4rem' }}>
      <style>{`
        @keyframes uvpulse { 0%,100% { opacity:1 } 50% { opacity:.4 } }
        @keyframes uvspin { to { transform: rotate(360deg) } }
        @keyframes uvfade { from { opacity:0; transform: translateY(4px) } to { opacity:1; transform:none } }
        .uv-row { transition: box-shadow .15s ease, background .15s ease; }
        .uv-row:hover { background: var(--paper-2) !important; box-shadow: var(--sh-sm); }
        .uv-log > div { animation: uvfade .25s ease both; }
      `}</style>

      {/* header + source rail */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={eyebrow}>Variant commons watch</div>
          <h1 style={{ fontSize: '1.7rem', margin: '.15rem 0' }}>MLH1 / Lynch surveillance</h1>
          <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
            Live engine: evidence from BigQuery, verdicts from Gemini 3.1 Pro, structure from AlphaFold. Synthetic cohort.
          </div>
        </div>
        <div style={{ ...card, padding: '.7rem .8rem', minWidth: 330 }}>
          <div style={{ ...eyebrow, marginBottom: '.45rem' }}>Evidence sources</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
            {(feeds ?? []).map((f) => (
              <SourceChip key={f.schema} label={f.schema} fresh={!f.is_stale}
                sub={f.hours_old != null ? `${f.hours_old}h` : '?'}
                busy={resyncing === f.schema} onClick={() => doResync(f)} />
            ))}
            {!feeds && <span style={{ ...mono({ fontSize: '.7rem' }), color: 'var(--faint)' }}>checking Fivetran via MCP...</span>}
            <SourceChip label="alphafold" fresh sub="db" />
            <SourceChip label="gemini" fresh sub="3.1pro" />
          </div>
          <div style={{ ...mono({ fontSize: '.62rem' }), color: 'var(--faint)', marginTop: '.45rem' }}>
            click a Fivetran source to trigger a targeted re-sync
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginTop: '1.1rem', alignItems: 'flex-start' }}>
        <NavRail view={view} setView={setView} />
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: '1rem' }}>
          {err && <div style={{ ...card, ...tag('var(--path-d)', 'var(--path-bg)'), whiteSpace: 'normal' }}>Backend error: {err}. Is the API running on :8000?</div>}

          {view === 'pedigree' && cohort && <PedigreeView patientId={pid} cohort={cohort} />}
          {view === 'graph' && <GraphView patientId={pid} />}
          {view === 'add' && cohort && <AddPatientView cohort={cohort} onAdded={refreshCohort} />}

          {view === 'watchlist' && (<>
          {/* impact strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '.8rem' }}>
            <Metric n={cohort ? `${flagged.length}` : '…'} label="variants reclassified" />
            <Metric n={`${escalations.length}`} label="escalations to act on" tone="path" />
            <Metric n={`${maxSilent}`} label="years silent (max)" tone="path" />
            <Metric n={feeds ? `${feeds.filter((f) => !f.is_stale).length}/${feeds.length}` : '…'} label="Fivetran feeds fresh" tone="benign" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,340px) minmax(0,1fr)', gap: '1.1rem', alignItems: 'start' }}>
        {/* worklist */}
        <div style={{ ...card, padding: '.9rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={eyebrow}>Watchlist · ranked by urgency</div>
            <span style={{ ...mono({ fontSize: '.66rem' }), color: 'var(--faint)' }}>{cohort?.length ?? 0} cases</span>
          </div>
          <div style={{ display: 'grid', gap: '.4rem', marginTop: '.6rem' }}>
            {!cohort && <div style={{ color: 'var(--faint)', fontSize: '.85rem' }}>loading cohort from BigQuery...</div>}
            {cohort?.map((r) => {
              const bc = bandColor(r.band); const dc = dirChip(r.direction);
              const isSel = sel?.patient_id === r.patient_id;
              const silent = yearsSince(r.recorded_date);
              return (
                <div key={r.patient_id} className="uv-row" onClick={() => selectPatient(r)}
                  style={{
                    cursor: 'pointer', borderRadius: 10, padding: '.55rem .6rem',
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                    boxShadow: isSel ? 'inset 0 0 0 1.5px var(--ink)' : 'none',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.4rem', alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 700, fontSize: '.88rem' }}>{r.patient_name}{r.deceased ? ' †' : ''}</span>
                    <span style={tag(dc.fg, dc.bg)}>{dc.label}</span>
                  </div>
                  <div style={{ ...mono({ fontSize: '.7rem' }), color: 'var(--muted)', marginTop: '.15rem' }}>
                    {r.gene} {r.hgvs_c} · {r.review_stars}★
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.35rem' }}>
                    <Gauge p={r.posterior} />
                    <span style={mono({ fontSize: '.72rem', color: bc.fg, fontWeight: 600 })}>{r.posterior.toFixed(2)}</span>
                  </div>
                  {silent != null && r.reclassified && (
                    <div style={{ ...mono({ fontSize: '.64rem' }), color: silent >= 3 ? 'var(--path-d)' : 'var(--faint)', marginTop: '.2rem' }}>
                      silent {silent} yr{silent === 1 ? '' : 's'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* case workup */}
        <div style={{ display: 'grid', gap: '1rem' }}>
          {!sel && <div style={{ ...card, color: 'var(--faint)' }}>Select a case from the watchlist to open the workup and run the agent loop.</div>}

          {sel && (
            <>
              <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '.6rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.25rem' }}>{sel.patient_name}{sel.deceased ? ' †' : ''}</h2>
                    <div style={mono({ fontSize: '.76rem', color: 'var(--muted)', marginTop: '.15rem' })}>
                      {sel.gene} {sel.hgvs_c}{sel.hgvs_p ? ` (${sel.hgvs_p})` : ''}
                    </div>
                    <div style={{ fontSize: '.8rem', color: 'var(--muted)', marginTop: '.3rem' }}>
                      registry: <b>{sel.recorded_class}</b> → ClinVar now: <b style={{ color: bandColor(sel.current_class || '').fg }}>{sel.current_class}</b> ({sel.review_stars}★)
                    </div>
                  </div>
                  <button onClick={() => runWatch()} disabled={running || !sel.reclassified}
                    style={{
                      background: sel.reclassified ? 'var(--thread)' : 'var(--line-2)', color: '#fff', fontWeight: 700,
                      borderRadius: 9, padding: '.6rem 1.1rem', fontSize: '.85rem', opacity: running ? .7 : 1,
                      cursor: sel.reclassified ? 'pointer' : 'default',
                    }}>
                    {running ? 'Running loop…' : sel.reclassified ? '▶ Run watch loop' : 'no change to act on'}
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '.25rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                  {AGENTS.map((a, i) => (
                    <div key={a} style={{ display: 'flex', alignItems: 'center' }}>
                      <PipelineNode name={a} state={nodes[a]} />
                      {i < AGENTS.length - 1 && <span style={{ color: 'var(--line-2)', margin: '0 .05rem' }}>→</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* posterior + ledger */}
              <div style={card}>
                <div style={eyebrow}>Calibrated posterior · point-based ACMG</div>
                <div style={{ display: 'flex', gap: '1.4rem', alignItems: 'center', marginTop: '.6rem', flexWrap: 'wrap' }}>
                  <BigGauge p={sel.posterior} />
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--serif)', fontSize: '2.2rem', color: bandColor(sel.band).fg }}>{sel.posterior.toFixed(2)}</span>
                      <span style={tag(bandColor(sel.band).fg, bandColor(sel.band).bg)}>{sel.band}</span>
                      <span style={mono({ fontSize: '.72rem', color: 'var(--faint)' })}>{sel.points} pts · gap {sel.points_to_actionable}</span>
                    </div>
                    <div style={{ marginTop: '.5rem' }}>
                      {sel.cited.length === 0 && <div style={mono({ fontSize: '.74rem', color: 'var(--faint)' })}>no molecular criteria met</div>}
                      {sel.cited.map((c, i) => (
                        <div key={i} style={mono({ fontSize: '.74rem', color: 'var(--muted)', padding: '.08rem 0' })}>{c}</div>
                      ))}
                    </div>
                  </div>
                </div>
                {sel.breakdown && (
                  <div style={{ marginTop: '1rem', paddingTop: '.9rem', borderTop: '1px solid var(--line)' }}>
                    <PosteriorBreakdown breakdown={sel.breakdown} />
                  </div>
                )}
              </div>

              {adj?.verdict && (
                <OutCard title="Adjudicator verdict · Gemini 3.1 Pro" edge={adj.verdict.withheld ? 'var(--path)' : 'var(--thread)'}>
                  <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
                    <span style={tag(adj.verdict.triage === 'actionable' ? 'var(--path-d)' : 'var(--thread-d)', adj.verdict.triage === 'actionable' ? 'var(--path-bg)' : 'var(--vus-bg)')}>triage: {adj.verdict.triage}</span>
                    <span style={tag('var(--ink)', 'var(--paper-2)')}>action: {adj.verdict.action}</span>
                    <span style={tag(adj.verdict.withheld ? 'var(--path-d)' : 'var(--benign)', adj.verdict.withheld ? 'var(--path-bg)' : 'var(--benign-bg)')}>{adj.verdict.withheld ? 'withheld' : 'not withheld'}</span>
                  </div>
                  <p style={{ fontSize: '.88rem', lineHeight: 1.55 }}>{adj.verdict.rationale}</p>
                </OutCard>
              )}

              {plan && (
                <OutCard title="Resolution Planner · next best evidence" edge="var(--conflict)">
                  <p style={{ fontSize: '.88rem', marginBottom: '.5rem' }}>{plan.recommendation}</p>
                  {plan.steps.slice(0, 4).map((s) => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.76rem', padding: '.2rem 0', borderTop: '1px solid var(--line)' }}>
                      <span style={{ flex: 1 }}>{s.label} <span style={mono({ color: 'var(--faint)' })}>({s.code} {s.strength})</span></span>
                      <span style={mono({ color: s.crosses_actionable ? 'var(--path-d)' : 'var(--muted)' })}>→ {s.projected_posterior.toFixed(2)}</span>
                      {s.crosses_actionable && <span style={tag('var(--path-d)', 'var(--path-bg)')}>crosses</span>}
                    </div>
                  ))}
                </OutCard>
              )}

              {casc && <CascadeCard casc={casc} />}

              {stew && (stew.has_deceased_carrier || stew.give_back) && (
                <OutCard title="Steward · ethics + give-back" edge="var(--benign)">
                  {stew.ethics_routes.map((e) => (
                    <div key={e.deceased} style={{ fontSize: '.85rem', marginBottom: '.4rem' }}>
                      <b>{e.deceased}</b> (deceased) → {e.route}. Living relatives: {e.living_relatives.join(', ') || 'none on file'}.
                    </div>
                  ))}
                  <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
                    Draft ClinVar give-back: {stew.give_back.variant} → <b>{stew.give_back.submitted_classification}</b> (draft-only)
                  </div>
                </OutCard>
              )}

              {struc && (
                <OutCard title="Structural story · AlphaFold + AlphaMissense" edge="var(--thread-d)">
                  <p style={{ fontSize: '.86rem', marginBottom: '.5rem' }}>{struc.summary}</p>
                  <StructureViewer structural={struc} />
                  <div style={{ display: 'flex', gap: '1.4rem', flexWrap: 'wrap', marginTop: '.7rem' }}>
                    <Stat n={`${struc.enrichment}x`} label="enrichment" tone="path" />
                    <Stat n={struc.variant_mean_am.toFixed(2)} label="residue AM" />
                    <Stat n={`${struc.variant_plddt}`} label="pLDDT" />
                    <Stat n={`${struc.n_neighbours}`} label={`neighbours (${struc.radius_angstrom}A)`} />
                  </div>
                  <a href={struc.structure_page} target="_blank" rel="noreferrer" style={{ fontSize: '.82rem', fontWeight: 600, display: 'inline-block', marginTop: '.5rem' }}>
                    View on AlphaFold DB ({struc.uniprot}) &rarr;
                  </a>
                </OutCard>
              )}

              {/* activity log */}
              <div style={{ ...card, background: '#11141f', border: '1px solid #20263a' }}>
                <div style={{ ...eyebrow, color: '#7f8aa3' }}>Agent activity log</div>
                <div ref={logRef} className="uv-log" style={{ maxHeight: 200, overflowY: 'auto', marginTop: '.5rem' }}>
                  {log.length === 0 && <div style={mono({ fontSize: '.76rem', color: '#5b647a' })}>idle — run the watch loop</div>}
                  {log.map((l, i) => (
                    <div key={i} style={mono({ fontSize: '.74rem', padding: '.12rem 0', color: l.tone === 'warn' ? '#e8b06a' : l.tone === 'ok' ? '#7fd1a3' : '#aeb6c8' })}>
                      <span style={{ color: '#5b647a' }}>[{l.agent}]</span> {l.text}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
          </>)}
        </div>
      </div>
    </main>
  );
}

function NavRail({ view, setView }: { view: View; setView: (v: View) => void }) {
  return (
    <div style={{ ...card, padding: '.5rem', display: 'flex', flexDirection: 'column', gap: '.2rem', width: 150, flex: '0 0 auto', position: 'sticky', top: 12 }}>
      {NAV.map((n) => {
        const on = view === n.id;
        const Icon = n.icon;
        return (
          <button key={n.id} onClick={() => setView(n.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.5rem .6rem', borderRadius: 8,
              background: on ? 'var(--vus-bg)' : 'transparent', color: on ? 'var(--thread-d)' : 'var(--muted)',
              fontWeight: on ? 700 : 600, fontSize: '.82rem', cursor: 'pointer', textAlign: 'left', width: '100%',
            }}>
            <Icon size={15} /> {n.label}
          </button>
        );
      })}
    </div>
  );
}

function SourceChip({ label, fresh, sub, busy, onClick }: { label: string; fresh: boolean; sub: string; busy?: boolean; onClick?: () => void }) {
  const Icon = SOURCE_ICON[label] ?? Database;
  return (
    <button onClick={onClick} disabled={!onClick || busy}
      style={{ display: 'flex', alignItems: 'center', gap: '.35rem', border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 999, padding: '.25rem .55rem', cursor: onClick ? 'pointer' : 'default' }}>
      <Icon size={13} color="var(--muted)" style={{ animation: busy ? 'uvspin 1s linear infinite' : 'none' }} />
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: fresh ? 'var(--benign)' : 'var(--path)', animation: fresh && !busy ? 'uvpulse 2.2s ease-in-out infinite' : 'none' }} />
      <span style={mono({ fontSize: '.68rem', fontWeight: 600, color: 'var(--ink)' })}>{label}</span>
      <span style={mono({ fontSize: '.62rem', color: 'var(--faint)' })}>{busy ? 'syncing' : sub}</span>
    </button>
  );
}

function Metric({ n, label, tone }: { n: string; label: string; tone?: 'path' | 'benign' }) {
  const col = tone === 'path' ? 'var(--path-d)' : tone === 'benign' ? 'var(--benign)' : 'var(--thread-d)';
  return (
    <div style={{ ...card, padding: '.7rem .9rem' }}>
      <div style={{ fontFamily: 'var(--serif)', fontSize: '1.7rem', color: col, lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: '.2rem' }}>{label}</div>
    </div>
  );
}

function Stat({ n, label, tone }: { n: string; label: string; tone?: 'path' }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--serif)', fontSize: '1.4rem', color: tone === 'path' ? 'var(--path-d)' : 'var(--ink)' }}>{n}</div>
      <div style={mono({ fontSize: '.64rem', color: 'var(--faint)' })}>{label}</div>
    </div>
  );
}

function Gauge({ p }: { p: number }) {
  return (
    <span style={{ position: 'relative', flex: 1, height: 7, borderRadius: 999, background: 'linear-gradient(90deg,var(--benign),#d7c98f 40%,#e7b06a 56%,var(--path))' }}>
      <span style={{ position: 'absolute', top: -2, left: '90%', width: 1.5, height: 11, background: 'rgba(23,26,43,.3)' }} />
      <span style={{ position: 'absolute', top: -2.5, left: `calc(${p * 100}% - 1px)`, width: 2.5, height: 12, background: 'var(--ink)', borderRadius: 2, transition: 'left .8s cubic-bezier(.2,.8,.2,1)' }} />
    </span>
  );
}

function BigGauge({ p }: { p: number }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(p), 60); return () => clearTimeout(t); }, [p]);
  return (
    <div style={{ width: 150 }}>
      <div style={{ position: 'relative', height: 14, borderRadius: 999, background: 'linear-gradient(90deg,var(--benign),#d7c98f 40%,#e7b06a 56%,var(--path))' }}>
        <div style={{ position: 'absolute', top: -4, left: '90%', width: 2, height: 22, background: 'rgba(23,26,43,.35)' }} />
        <div style={{ position: 'absolute', top: -5, left: `calc(${w * 100}% - 1.5px)`, width: 3, height: 24, background: 'var(--ink)', borderRadius: 2, transition: 'left 1s cubic-bezier(.2,.8,.2,1)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '.3rem' }}>
        <span style={mono({ fontSize: '.6rem', color: 'var(--faint)' })}>benign</span>
        <span style={mono({ fontSize: '.6rem', color: 'var(--faint)' })}>0.90</span>
        <span style={mono({ fontSize: '.6rem', color: 'var(--faint)' })}>path</span>
      </div>
    </div>
  );
}

function PipelineNode({ name, state }: { name: Agent; state: NodeState }) {
  const Icon = AGENT_ICON[name];
  const map = {
    idle: { bg: 'var(--paper-2)', fg: 'var(--faint)' },
    running: { bg: 'var(--vus-bg)', fg: 'var(--thread-d)' },
    done: { bg: 'var(--benign-bg)', fg: 'var(--benign)' },
    held: { bg: '#fdf1d9', fg: '#8a6300' },
  }[state];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem', background: map.bg, border: '1px solid var(--line)', borderRadius: 8, padding: '.32rem .5rem' }}>
      <Icon size={13} color={map.fg} style={{ animation: state === 'running' ? 'uvpulse 1s ease-in-out infinite' : 'none' }} />
      <span style={mono({ fontSize: '.68rem', fontWeight: 600, color: map.fg })}>
        {name}{state === 'done' ? ' ✓' : state === 'held' ? ' ⏸' : state === 'running' ? '…' : ''}
      </span>
    </div>
  );
}

function CascadeCard({ casc }: { casc: CascadeResult }) {
  const [showFhir, setShowFhir] = useState(false);
  const [fhirIdx, setFhirIdx] = useState(0);
  const draft = casc.drafts[fhirIdx];
  const fhirBundle = draft ? [draft.communication, draft.risk_assessment].filter(Boolean) : [];

  return (
    <OutCard title="Cascade Coordinator · draft recontact" edge="var(--path)">
      <div style={{ fontSize: '.88rem', marginBottom: '.4rem' }}>
        <b>{casc.drafts.length}</b> draft FHIR proposals, {casc.carriers} carrier(s) + {casc.relatives} at-risk relative(s)
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem' }}>
        {casc.drafts.map((d, i) => (
          <button key={d.patient_id} onClick={() => { setFhirIdx(i); setShowFhir(true); }}
            style={{
              ...tag('var(--thread-d)', 'var(--vus-bg)'),
              cursor: 'pointer', border: fhirIdx === i && showFhir ? '1.5px solid var(--thread-d)' : '1px solid transparent',
            }}>
            {d.for}, {d.relationship}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginTop: '.5rem' }}>
        <button onClick={() => setShowFhir(!showFhir)}
          style={{
            fontFamily: 'var(--mono)', fontSize: '.72rem', fontWeight: 600,
            padding: '.3rem .6rem', borderRadius: 6,
            border: '1px solid var(--line)', cursor: 'pointer',
            background: showFhir ? 'var(--vus-bg)' : 'var(--surface)',
            color: showFhir ? 'var(--thread-d)' : 'var(--muted)',
          }}>
          {showFhir ? 'Hide FHIR' : 'View as FHIR'}
        </button>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '.64rem', color: 'var(--faint)' }}>{casc.note}</span>
      </div>
      {showFhir && fhirBundle.length > 0 && (
        <pre style={{
          marginTop: '.5rem', padding: '.7rem', borderRadius: 8,
          background: '#0d1117', border: '1px solid #20263a', color: '#aeb6c8',
          fontFamily: 'var(--mono)', fontSize: '.7rem', lineHeight: 1.5,
          maxHeight: 300, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {JSON.stringify({ resourceType: 'Bundle', type: 'collection', entry: fhirBundle.map((r) => ({ resource: r })) }, null, 2)}
        </pre>
      )}
    </OutCard>
  );
}

function OutCard({ title, edge, children }: { title: string; edge: string; children: ReactNode }) {
  return (
    <div style={{ ...card, animation: 'uvfade .3s ease both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: edge, flex: '0 0 auto' }} />
        <div style={eyebrow}>{title}</div>
      </div>
      <div style={{ marginTop: '.5rem' }}>{children}</div>
    </div>
  );
}
