export function DataBackdrop() {
  return (
    <div className="data-backdrop" aria-hidden="true">
      <div className="data-orbit data-orbit-one" />
      <div className="data-orbit data-orbit-two" />
      <svg viewBox="0 0 800 360" preserveAspectRatio="none">
        <path d="M0 295 C120 300 150 220 260 238 S420 148 500 175 S650 72 800 54" />
        <path d="M0 330 C160 292 210 318 330 240 S540 208 800 115" />
      </svg>
    </div>
  );
}
