import { Link, useLocation } from 'react-router-dom';

function ThreadMark() {
  // an open loop that trails into a thread, the loop being followed/closed
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden>
      <path d="M21 9.5a7 7 0 1 0 1.2 7.8" stroke="#2450a4" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M21 4.5 L21 11 L27 11" stroke="#173268" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="15" cy="15" r="2.1" fill="#173268" />
    </svg>
  );
}

export default function Navigation() {
  const { pathname } = useLocation();
  const link = (to: string, label: string) => (
    <Link
      to={to}
      style={{
        fontWeight: 600,
        fontSize: '.95rem',
        color: pathname === to ? 'var(--thread-d)' : 'var(--muted)',
        paddingBottom: '2px',
        borderBottom: pathname === to ? '2px solid var(--thread)' : '2px solid transparent',
      }}
    >
      {label}
    </Link>
  );

  return (
    <nav style={{ position: 'sticky', top: 0, zIndex: 100 }}>
      <div className="needle" />
      <div style={{ background: 'rgba(245,243,238,.82)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.85rem 2rem' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
            <ThreadMark />
            <span style={{ fontFamily: 'var(--serif)', fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
              Unravel
            </span>
          </Link>

          <div style={{ display: 'flex', gap: '1.9rem', alignItems: 'center' }}>
            <span className="hide-sm">{link('/', 'Home')}</span>
            <span className="hide-sm">{link('/mission', 'Mission')}</span>
            <span className="hide-sm">{link('/technology', 'Technology')}</span>
            <Link to="/app" className="btn btn-primary btn-sm">Open Simulator</Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
