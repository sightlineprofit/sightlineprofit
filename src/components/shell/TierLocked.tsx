// Single-plan model: no tier locks exist. This component is retained as an
// inert shim so existing callers keep compiling, but it renders nothing.
export function TierLocked(_props: {
  tier?: "studio" | "practice";
  title?: string;
  unlocks?: string[];
  blurb?: string;
}) {
  return null;
}