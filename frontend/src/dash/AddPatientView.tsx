import { useState } from 'react';
import { UserPlus, Check, Dna } from 'lucide-react';
import { addPatient, type CohortRow } from '../api';
import { card, mono } from './ui';

// the seeded demo family variant, offered as a one-click "carries the family variant"
const HERO = { gid: '3-36993661-C-G', gene: 'MLH1', hgvs_c: 'c.114C>G', hgvs_p: 'p.Asn38Lys' };

const labelStyle: React.CSSProperties = { fontSize: '.72rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '.25rem' };
const hint: React.CSSProperties = { fontSize: '.68rem', color: 'var(--faint)', marginTop: '.2rem' };

function Field({ label, required, hintText, children }: { label: string; required?: boolean; hintText?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}{required && <span style={{ color: 'var(--path-d)' }}> *</span>}</label>
      {children}
      {hintText && <div style={hint}>{hintText}</div>}
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1.1rem', marginTop: '1.1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.8rem' }}>
        <span style={{ ...mono({ fontSize: '.66rem', fontWeight: 600 }), color: 'var(--thread)', border: '1px solid var(--primary-soft)', background: 'var(--primary-soft)', borderRadius: 6, padding: '.1rem .4rem' }}>{n}</span>
        <span style={{ fontWeight: 700, fontSize: '.92rem' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function AddPatientView({ cohort, onAdded }: { cohort: CohortRow[]; onAdded: () => void }) {
  const [f, setF] = useState({
    given: '', family: '', gender: 'unknown', birth: '', email: '', phone: '',
    relative_of: '', relationship: '', carrier: false,
  });
  const set = (k: string, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!f.given || !f.family) { setErr('First and last name are required.'); return; }
    setBusy(true); setErr(null); setDone(null);
    try {
      const r = await addPatient({
        given: f.given, family: f.family, gender: f.gender, birth: f.birth || undefined,
        email: f.email || undefined, phone: f.phone || undefined,
        relative_of: f.relative_of || undefined, relationship: f.relationship || undefined,
        ...(f.carrier ? { gid: HERO.gid, gene: HERO.gene, hgvs_c: HERO.hgvs_c } : {}),
      });
      setDone(`${f.given} ${f.family} added to the registry (${r.patient_id}).`);
      setF({ given: '', family: '', gender: 'unknown', birth: '', email: '', phone: '', relative_of: '', relationship: '', carrier: false });
      onAdded();
    } catch (e: unknown) {
      setErr(String((e as Error).message || e));
    } finally { setBusy(false); }
  }

  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.8rem' };

  return (
    <div style={{ ...card, maxWidth: 620 }}>
      <style>{`
        .uv-field { width:100%; border:1px solid var(--line); border-radius:9px; padding:.55rem .65rem;
          font-size:.88rem; font-family:var(--sans); background:var(--paper); color:var(--ink); transition:border-color .15s, box-shadow .15s; }
        .uv-field:focus { outline:none; border-color:var(--thread); box-shadow:0 0 0 3px var(--primary-soft); background:var(--surface); }
        .uv-field::placeholder { color:var(--faint); }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--primary-soft)', display: 'grid', placeItems: 'center' }}>
          <UserPlus size={16} color="var(--thread)" />
        </span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>New patient intake</div>
          <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Writes a FHIR R4 Patient to the registry (Firestore), live.</div>
        </div>
      </div>

      <Section n="1" title="Patient">
        <div style={grid}>
          <Field label="First name" required><input className="uv-field" value={f.given} onChange={(e) => set('given', e.target.value)} placeholder="Jane" /></Field>
          <Field label="Last name" required><input className="uv-field" value={f.family} onChange={(e) => set('family', e.target.value)} placeholder="Doe" /></Field>
          <Field label="Sex">
            <select className="uv-field" value={f.gender} onChange={(e) => set('gender', e.target.value)}>
              <option value="unknown">Unknown</option><option value="female">Female</option>
              <option value="male">Male</option><option value="other">Other</option>
            </select>
          </Field>
          <Field label="Date of birth"><input className="uv-field" type="date" value={f.birth} onChange={(e) => set('birth', e.target.value)} /></Field>
        </div>
      </Section>

      <Section n="2" title="Contact">
        <div style={grid}>
          <Field label="Email" hintText="used to draft the recontact"><input className="uv-field" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="jane.doe@example.com" /></Field>
          <Field label="Phone"><input className="uv-field" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="optional" /></Field>
        </div>
      </Section>

      <Section n="3" title="Family link">
        <div style={grid}>
          <Field label="Relative of" hintText="leave blank to add a new proband">
            <select className="uv-field" value={f.relative_of} onChange={(e) => set('relative_of', e.target.value)}>
              <option value="">— none (new proband) —</option>
              {cohort.map((r) => <option key={r.patient_id} value={r.patient_id}>{r.patient_name}</option>)}
            </select>
          </Field>
          <Field label="Relationship"><input className="uv-field" value={f.relationship} onChange={(e) => set('relationship', e.target.value)} placeholder="e.g. daughter, brother" /></Field>
        </div>
      </Section>

      <Section n="4" title="Variant">
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.6rem', cursor: 'pointer', padding: '.6rem .7rem', border: `1px solid ${f.carrier ? 'var(--thread)' : 'var(--line)'}`, borderRadius: 9, background: f.carrier ? 'var(--primary-soft)' : 'var(--paper)' }}>
          <input type="checkbox" checked={f.carrier} onChange={(e) => set('carrier', e.target.checked)} style={{ accentColor: 'var(--thread)', marginTop: '.15rem' }} />
          <span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '.35rem', fontSize: '.86rem', fontWeight: 600 }}>
              <Dna size={13} color="var(--thread)" /> Tested positive for the family variant
            </span>
            <span style={mono({ fontSize: '.72rem', color: 'var(--muted)' })}>{HERO.gene} {HERO.hgvs_c} ({HERO.hgvs_p})</span>
          </span>
        </label>
      </Section>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.3rem' }}>
        <button onClick={submit} disabled={busy}
          style={{ background: 'var(--thread)', color: '#fff', fontWeight: 700, borderRadius: 9, padding: '.6rem 1.3rem', fontSize: '.88rem', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Adding…' : 'Add to registry'}
        </button>
        {done && <span style={{ color: 'var(--benign)', display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.84rem' }}><Check size={14} /> {done}</span>}
        {err && <span style={{ color: 'var(--path-d)', ...mono({ fontSize: '.8rem' }) }}>{err}</span>}
      </div>
    </div>
  );
}
