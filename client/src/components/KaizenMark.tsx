export default function KaizenMark({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="km-arcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#DE7356" />
          <stop offset="100%" stopColor="#C45A3E" />
        </linearGradient>
      </defs>
      <path d="M 40 14 A 26 26 0 1 1 14.5 46" fill="none" stroke="url(#km-arcGrad)" strokeWidth="4.5" strokeLinecap="round"/>
      <path d="M 40 23 A 17 17 0 1 1 23.5 46" fill="none" stroke="#DE7356" strokeWidth="3" strokeLinecap="round" opacity="0.6"/>
      <circle cx="40" cy="40" r="5" fill="url(#km-arcGrad)"/>
      <polyline points="10,50 14.5,46 19.5,51" fill="none" stroke="url(#km-arcGrad)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
