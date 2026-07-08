// Single-plan model: no upgrade path exists, so this modal is an inert shim
// kept only so existing callers continue to compile.
export function UpgradeModal(_props: {
  targetTier: "studio" | "practice" | null;
  currentTier: "studio" | "practice";
  onClose: () => void;
}) {
  return null;
}