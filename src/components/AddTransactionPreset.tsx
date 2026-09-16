import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * SCRATCHPAD "Next Steps": AddTransactionFab is a single app-shell-level
 * singleton (mounted once in app.tsx) with no props — this context lets a
 * detail dialog on another route (Account, Institution) open it pre-filled
 * instead of the user having to close the dialog and manually reselect.
 */
export type AddTransactionPreset = { accountId?: string; institutionId?: string };

type AddTransactionPresetValue = {
  open: boolean;
  preset: AddTransactionPreset | null;
  openWithPreset: (preset?: AddTransactionPreset) => void;
  close: () => void;
};

const AddTransactionPresetContext = createContext<AddTransactionPresetValue | null>(null);

export function AddTransactionPresetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<AddTransactionPreset | null>(null);

  function openWithPreset(next?: AddTransactionPreset) {
    setPreset(next ?? null);
    setOpen(true);
  }
  function close() {
    setOpen(false);
    setPreset(null);
  }

  return (
    <AddTransactionPresetContext.Provider value={{ open, preset, openWithPreset, close }}>
      {children}
    </AddTransactionPresetContext.Provider>
  );
}

export function useAddTransactionPreset() {
  const ctx = useContext(AddTransactionPresetContext);
  if (!ctx) {
    throw new Error("useAddTransactionPreset must be used within AddTransactionPresetProvider");
  }
  return ctx;
}
