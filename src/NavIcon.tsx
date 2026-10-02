type Section = "today" | "planning" | "search" | "settings";
export default function NavIcon({ section }: { section: Section }) {
  return (
    <svg
      aria-hidden="true"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {section === "today" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      )}
      {section === "planning" && (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M7 3v4M17 3v4M3 11h18M7 15h2M15 15h2M7 18h2" />
        </>
      )}
      {section === "search" && (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 5 5" />
        </>
      )}
      {section === "settings" && (
        <>
          <path d="M3 6h3m4 0h11M3 12h11m4 0h3M3 18h5m4 0h9" />
          <circle cx="8" cy="6" r="2" />
          <circle cx="16" cy="12" r="2" />
          <circle cx="10" cy="18" r="2" />
        </>
      )}
    </svg>
  );
}
