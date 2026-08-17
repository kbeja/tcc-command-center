import { createContext, useContext } from 'react';
import { useWorkshopItems } from '../lib/hooks';

const WorkshopContext = createContext(null);

// Single useWorkshopItems() call shared by every consumer (Nav badge,
// Workshop page) instead of each calling the hook independently — OPT-004.
// useWorkshopItems() carries its own realtime subscription (see hooks.js),
// so this fixes both the redundant-fetch cost and a real staleness bug:
// resolving/archiving an item on the Workshop page used to leave the Nav
// badge count stale until a full reload.
export function WorkshopProvider({ children }) {
  const value = useWorkshopItems();
  return <WorkshopContext.Provider value={value}>{children}</WorkshopContext.Provider>;
}

export function useWorkshopContext() {
  const ctx = useContext(WorkshopContext);
  if (!ctx) throw new Error('useWorkshopContext must be used within a WorkshopProvider');
  return ctx;
}
