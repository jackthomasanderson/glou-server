import React from "react";

export const DashboardIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <rect x="3" y="3" width="7" height="9" stroke="currentColor" strokeWidth="1.5" fill="none" rx="1" />
    <rect x="14" y="3" width="7" height="5" stroke="currentColor" strokeWidth="1.5" fill="none" rx="1" />
    <rect x="14" y="12" width="7" height="9" stroke="currentColor" strokeWidth="1.5" fill="none" rx="1" />
    <rect x="3" y="14" width="7" height="7" stroke="currentColor" strokeWidth="1.5" fill="none" rx="1" />
  </svg>
);

export const BottlesIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M9 2v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M15 2v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <rect x="6" y="8" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </svg>
);

export const CellarsIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M3 7h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M6 7v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M18 7v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <rect x="8" y="9" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </svg>
);

export const CigarsIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <rect x="3" y="9" width="14" height="6" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <circle cx="20" cy="12" r="1" fill="currentColor" />
  </svg>
);

export const ProfileIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M5.5 20c1.5-3 4.5-5 6.5-5s5 2 6.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
  </svg>
);

export default function Icon() {
  return null;
}
