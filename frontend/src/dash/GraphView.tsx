import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { getGraph, type Graph } from '../api';
import { card, mono, eyebrow, tag } from './ui';

// Obsidian-style palette on a dark canvas
const COLOR: Record<string, string> = {
  variant: '#eaf0fb',
  source: '#5b8cff',
  carrier: '#ff6b81',
  relative: '#37d6c0',
};
const SIZE: Record<string, number> = { variant: 9, source: 6, carrier: 5.5, relative: 4.5 };

type FGNode = { id: string; label: string; type: string; meta?: string; x?: number; y?: number };

export default function GraphView({ patientId }: { patientId: string }) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);

  useEffect(() => {
    setGraph(null); setErr(null);
    getGraph(patientId).then(setGraph).catch((e) => setErr(String(e.message || e)));
  }, [patientId]);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [graph]);

  const data = useMemo(() => {
    if (!graph) return { nodes: [] as FGNode[], links: [] as any[] };
    const others = graph.nodes.filter((n) => n.type !== 'variant');
    const nodes = graph.nodes.map((n) => {
      if (n.type === 'variant') return { ...n, x: 0, y: 0 };
      const i = others.indexOf(n);
      const ang = (i / Math.max(1, others.length)) * 2 * Math.PI;
      // seed a wide ring so the layout starts spread (Obsidian-like), forces then refine
      return { ...n, x: Math.cos(ang) * 260, y: Math.sin(ang) * 260 };
    }) as FGNode[];
    return { nodes, links: graph.edges.map((e) => ({ source: e.source, target: e.target })) };
  }, [graph]);

  // adjacency for hover highlighting
  const neighbours = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    data.links.forEach((l: any) => {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      (m[s] ||= new Set()).add(t); (m[t] ||= new Set()).add(s);
    });
    return m;
  }, [data]);

  const lit = useCallback((id: string) => !hover || hover === id || neighbours[hover]?.has(id), [hover, neighbours]);

  useEffect(() => {
    if (!graph) return;
    // apply after the simulation has initialised, then reheat so it spreads
    const id = setTimeout(() => {
      const fg = fgRef.current; if (!fg) return;
      try {
        fg.d3Force('charge').strength(-900).distanceMax(600);
        fg.d3Force('link').distance(150);
        fg.d3ReheatSimulation();
      } catch { /* forces not ready */ }
    }, 200);
    return () => clearTimeout(id);
  }, [graph]);

  if (err) return <div style={{ ...card, ...tag('var(--path-d)', 'var(--path-bg)'), whiteSpace: 'normal' }}>Error: {err}</div>;

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', background: '#0e1119', border: '1px solid #20263a' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '.5rem', padding: '1rem 1.2rem 0' }}>
        <div>
          <div style={{ ...eyebrow, color: '#7f8aa3' }}>Knowledge graph</div>
          <div style={{ fontSize: '.82rem', color: '#9aa4b8', marginTop: '.2rem' }}>
            One variant, its evidence, and everyone it touches. Drag, zoom, hover to trace.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
          <Legend c={COLOR.variant} t="variant" /><Legend c={COLOR.source} t="evidence" />
          <Legend c={COLOR.carrier} t="carrier" /><Legend c={COLOR.relative} t="relative" />
        </div>
      </div>

      <div ref={wrapRef} style={{ width: '100%', height: 520 }}>
        {graph && (
          <ForceGraph2D
            ref={fgRef}
            graphData={data}
            width={width}
            height={520}
            backgroundColor="#0e1119"
            cooldownTicks={200}
            d3VelocityDecay={0.28}
            onEngineStop={() => fgRef.current?.zoomToFit(500, 80)}
            onNodeHover={(n: any) => setHover(n ? n.id : null)}
            nodeRelSize={1}
            linkColor={(l: any) => {
              const s = typeof l.source === 'object' ? l.source.id : l.source;
              const t = typeof l.target === 'object' ? l.target.id : l.target;
              const on = !hover || hover === s || hover === t;
              return on ? 'rgba(140,160,200,0.45)' : 'rgba(120,140,180,0.10)';
            }}
            linkWidth={(l: any) => {
              const s = typeof l.source === 'object' ? l.source.id : l.source;
              const t = typeof l.target === 'object' ? l.target.id : l.target;
              return (hover && (hover === s || hover === t)) ? 2 : 1;
            }}
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              const r = SIZE[node.type] ?? 5;
              const color = COLOR[node.type] ?? '#8aa';
              const on = lit(node.id);
              ctx.globalAlpha = on ? 1 : 0.18;
              // glow
              ctx.shadowColor = color; ctx.shadowBlur = node.type === 'variant' ? 22 : 12;
              ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
              ctx.fillStyle = color; ctx.fill();
              ctx.shadowBlur = 0;
              if (node.type === 'variant') {
                ctx.beginPath(); ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI);
                ctx.strokeStyle = 'rgba(234,240,251,0.5)'; ctx.lineWidth = 1; ctx.stroke();
              }
              const fontSize = Math.max(2.2, 11 / globalScale);
              ctx.font = `600 ${fontSize}px Inter, sans-serif`;
              ctx.textAlign = 'center'; ctx.textBaseline = 'top';
              ctx.fillStyle = on ? '#d7deec' : 'rgba(150,160,180,0.25)';
              ctx.fillText(node.label, node.x, node.y + r + 2);
              ctx.globalAlpha = 1;
            }}
          />
        )}
        {!graph && <div style={{ color: '#7f8aa3', padding: '2rem', fontFamily: 'var(--mono)', fontSize: '.8rem' }}>building knowledge graph…</div>}
      </div>
    </div>
  );
}

function Legend({ c, t }: { c: string; t: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', ...mono({ fontSize: '.66rem', color: '#9aa4b8' }) }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: c, boxShadow: `0 0 6px ${c}` }} /> {t}
    </span>
  );
}
