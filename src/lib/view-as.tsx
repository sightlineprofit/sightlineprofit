import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ViewAsRole = "principal" | "admin" | "team" | "view_only";
export type ViewAsTier = "foundation" | "studio" | "practice";

export type ViewAsState = {
  role: ViewAsRole | null;
  tier: ViewAsTier | null;
  firmId: string | null;
};

type ViewAsCtx = ViewAsState & {
  setRole: (r: ViewAsRole | null) => void;
  setTier: (t: ViewAsTier | null) => void;
  setFirmId: (f: string | null) => void;
  setAll: (s: Partial<ViewAsState>) => void;
  clearAll: () => void;
  isActive: boolean;
};

const KEY = "sightline.viewAs.v1";
const Ctx = createContext<ViewAsCtx | null>(null);

const inert: ViewAsCtx = {
  role: null,
  tier: null,
  firmId: null,
  setRole: () => {},
  setTier: () => {},
  setFirmId: () => {},
  setAll: () => {},
  clearAll: () => {},
  isActive: false,
};

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ViewAsState>({
    role: null,
    tier: null,
    firmId: null,
  });

  // Hydrate from sessionStorage after mount (SSR-safe).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ViewAsState;
        setState({
          role: parsed.role ?? null,
          tier: parsed.tier ?? null,
          firmId: parsed.firmId ?? null,
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      if (state.role || state.tier || state.firmId) {
        sessionStorage.setItem(KEY, JSON.stringify(state));
      } else {
        sessionStorage.removeItem(KEY);
      }
    } catch {
      /* ignore */
    }
  }, [state]);

  const isActive = !!(state.role || state.tier || state.firmId);

  const value: ViewAsCtx = {
    ...state,
    setRole: (role) => setState((s) => ({ ...s, role })),
    setTier: (tier) => setState((s) => ({ ...s, tier })),
    setFirmId: (firmId) => setState((s) => ({ ...s, firmId })),
    setAll: (patch) => setState((s) => ({ ...s, ...patch })),
    clearAll: () => setState({ role: null, tier: null, firmId: null }),
    isActive,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useViewAs(): ViewAsCtx {
  return useContext(Ctx) ?? inert;
}