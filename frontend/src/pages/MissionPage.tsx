import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, AlertTriangle } from 'lucide-react';

const viewport = { once: true, margin: '-80px' };

export default function MissionPage() {
  return (
    <div className="fade-in">
      {/* HEADER */}
      <section className="sec" style={{ paddingBottom: 'clamp(2rem,1rem+3vw,3.5rem)' }}>
        <div className="wrapX" style={{ maxWidth: '900px' }}>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55 }}>
            <div className="mono-tag"><span className="dash" /> The mission</div>
            <h1 className="display display-fluid" style={{ margin: '1.3rem 0 1.4rem', maxWidth: '15ch' }}>
              The loop that <span className="emph">never closes</span>.
            </h1>
            <p className="body-lg" style={{ maxWidth: '60ch' }}>
              A genetic panel often returns a Variant of Uncertain Significance, one the lab can’t yet call benign or
              dangerous. Clinically, “uncertain” means do nothing. But the evidence does not stand still.
            </p>
          </motion.div>
        </div>
      </section>

      {/* DIANE, case file */}
      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="wrapX thesis-grid" style={{ alignItems: 'center' }}>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={viewport} transition={{ duration: .6 }}>
            <div className="mono-tag"><span className="dash" /> A true-to-life case · 01</div>
            <h2 className="display display-mid" style={{ margin: '1rem 0 1.3rem' }}>Diane, 44.</h2>
            <div className="body-lg" style={{ display: 'grid', gap: '1rem', maxWidth: '56ch' }}>
              <p>In 2019 she had a mastectomy for breast cancer. Her germline panel returned a <strong style={{ color: 'var(--ink)' }}>VUS in MLH1</strong>, a Lynch syndrome gene. Nothing was done. Her oncologist said, <em>“if it ever changes, we’ll let you know.”</em></p>
              <p>It changed. In 2023 a ClinGen expert panel reclassified that exact variant to <strong style={{ color: 'var(--ink)' }}>likely pathogenic</strong>. The update went public. It never reached Diane.</p>
            </div>
          </motion.div>

          <motion.div className="card" style={{ padding: 0, overflow: 'hidden' }} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={viewport} transition={{ duration: .7 }}>
            <div style={{ background: 'var(--primary-d)', color: '#fff', padding: '.7rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="mono" style={{ fontSize: '.72rem', letterSpacing: '.08em', fontWeight: 600 }}>CASE FILE</span>
              <span className="mono" style={{ fontSize: '.72rem', opacity: .85 }}>MLH1 · Lynch</span>
            </div>
            <div style={{ padding: '1.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem', marginBottom: '1.2rem' }}>
                <span className="badge badge-vus">VUS · 2019</span>
                <span style={{ color: 'var(--faint)' }}>→</span>
                <span className="badge badge-path">Likely pathogenic · 2023</span>
              </div>
              <div style={{ background: 'var(--path-soft)', border: '1px solid #f0b8bd', borderRadius: 'var(--r-sm)', padding: '1.2rem 1.3rem', display: 'flex', gap: '.9rem' }}>
                <AlertTriangle size={22} color="var(--path-d)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <p style={{ color: 'var(--path-d)', fontSize: '1rem', lineHeight: 1.55, fontWeight: 500 }}>
                  Her 22-year-old daughter could have started colonoscopies at 20 the day the variant flipped. She later
                  presented with a tumour Lynch surveillance is built to catch early. The loop never closed.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 24% */}
      <section className="sec" style={{ background: 'var(--paper-2)', borderTop: '1px solid var(--line)' }}>
        <div className="wrapX" style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 'clamp(2rem,1rem+4vw,4.5rem)', alignItems: 'center' }} >
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={viewport} transition={{ duration: .6 }}>
            <div className="mono-tag"><span className="dash" /> The reframe · 02</div>
            <div className="stat-huge" style={{ marginTop: '1.1rem' }}>24%</div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={viewport} transition={{ duration: .65 }}>
            <p className="body-lg" style={{ maxWidth: '52ch', marginBottom: '.6rem' }}>
              of genetic counsellors have received a reclassified VUS for a patient who had <span className="emph">already died</span>, with no guideline for what happens next.
            </p>
            <div className="mono" style={{ fontSize: '.7rem', color: 'var(--faint)', marginBottom: '1.4rem' }}>Lascurain et al., J. Genetic Counseling 2024</div>
            <p className="body-lg" style={{ maxWidth: '54ch' }}>
              That delay isn’t a flaw; it’s the reason this matters. A germline variant that flips is a <strong style={{ color: 'var(--ink)' }}>family event</strong>, yet <strong style={{ color: 'var(--ink)' }}>fewer than 30%</strong> of at-risk relatives are ever cascade-tested, and reclassification changes management in <strong style={{ color: 'var(--ink)' }}>up to 41%</strong> of patients. Unravel is <em>cascade-first</em>, and disease-agnostic: hereditary cancer and rare paediatric disease alike.
            </p>
            <div className="mono" style={{ fontSize: '.7rem', color: 'var(--faint)', marginTop: '.9rem' }}>npj Genomic Medicine 2024 · Makhnoon et al., Cancer Medicine 2023</div>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="sec center">
        <div className="wrapX">
          <h2 className="display display-mid" style={{ marginBottom: '1.4rem', maxWidth: '20ch', marginInline: 'auto' }}>See how Unravel closes the loop.</h2>
          <Link to="/app" className="btn btn-primary">Open the simulator <ArrowRight size={18} /></Link>
        </div>
      </section>
    </div>
  );
}
