'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const navItems = [
  { num: '01', label: 'what is kaizen', href: '/' },
  { num: '02', label: 'why', href: '/why' },
  { num: '03', label: 'build', href: '/build' },
  { num: '04', label: 'story', href: '/story' },
  { num: '05', label: 'roadmap', href: '/roadmap' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <ul className="nav-list">
      {navItems.map((item) => {
        const isActive = item.href === '/' ? pathname === '/' : pathname === item.href;
        return (
          <li key={item.href} className="nav-item">
            <Link
              href={item.href}
              className={`nav-link${isActive ? ' active' : ''}`}
              onClick={onClick}
            >
              <span className="nav-num">{item.num}</span>
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sidebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '2.5rem' }}>
          <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="50" cy="50" r="6" fill="#DE7356"/>
            <path d="M50 50 Q80 20 80 50 Q80 80 50 80 Q20 80 20 50 Q20 30 35 22"
                  stroke="#DE7356" strokeWidth="6" strokeLinecap="round" fill="none"/>
            <path d="M50 50 Q70 30 70 50 Q70 70 50 70 Q30 70 30 50 Q30 38 40 32"
                  stroke="#DE7356" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.7"/>
            <path d="M50 50 Q60 40 60 50 Q60 60 50 60 Q40 60 40 50 Q40 44 45 41"
                  stroke="#DE7356" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.4"/>
          </svg>
          <div className="sidebar-brand" style={{ marginBottom: 0 }}>kaizen documentation</div>
        </div>
        <NavLinks />
        <div className="sidebar-footer">
          <div>by Dev Saxena</div>
          <div>
            <a href="mailto:devvbuilds@gmail.com">devvbuilds@gmail.com</a>
          </div>
          <div>
            <a href="https://www.linkedin.com/in/dev-saxena-650a27207/" target="_blank" rel="noopener noreferrer">
              linkedin ↗
            </a>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="mobile-header">
        <span className="mobile-brand">kaizen documentation</span>
        <button className="hamburger-btn" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <span />
          <span />
          <span />
        </button>
      </div>

      {/* Mobile nav overlay */}
      <div className={`mobile-nav-overlay${mobileOpen ? ' open' : ''}`}>
        <button className="close-btn" onClick={() => setMobileOpen(false)} aria-label="Close menu">✕</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '2rem' }}>
          <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="50" cy="50" r="6" fill="#DE7356"/>
            <path d="M50 50 Q80 20 80 50 Q80 80 50 80 Q20 80 20 50 Q20 30 35 22"
                  stroke="#DE7356" strokeWidth="6" strokeLinecap="round" fill="none"/>
            <path d="M50 50 Q70 30 70 50 Q70 70 50 70 Q30 70 30 50 Q30 38 40 32"
                  stroke="#DE7356" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.7"/>
            <path d="M50 50 Q60 40 60 50 Q60 60 50 60 Q40 60 40 50 Q40 44 45 41"
                  stroke="#DE7356" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.4"/>
          </svg>
          <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontFamily: 'IBM Plex Mono, monospace' }}>
            kaizen documentation
          </span>
        </div>
        <NavLinks onClick={() => setMobileOpen(false)} />
        <div className="sidebar-footer" style={{ marginTop: '2rem' }}>
          <div>by Dev Saxena</div>
          <div><a href="mailto:devvbuilds@gmail.com">devvbuilds@gmail.com</a></div>
          <div>
            <a href="https://www.linkedin.com/in/dev-saxena-650a27207/" target="_blank" rel="noopener noreferrer">
              linkedin ↗
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
