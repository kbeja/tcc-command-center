import { createContext, useContext } from 'react';
import { useChapters, useCollections, useCollectionObjects } from '../lib/hooks';

const CollectionsContext = createContext(null);

// Calls useChapters()/useCollections()/useCollectionObjects() exactly once,
// shared by every consumer instead of each calling them independently —
// OPT-005 (33 call sites across 17 files). Each hook's own behavior is
// preserved verbatim, not merged or normalized: useCollections() carries a
// realtime .channel() subscription the other two don't; useCollectionObjects()
// selects `*` with no archived-status filter, unlike useCollections() and
// useChapters(), which both filter .neq('status', 'archived'). Losing either
// difference would be a real regression, not a simplification.
//
// useCollections() and useCollectionObjects() both natively return a
// `collections` key (string names vs. full row objects — different shapes),
// so this context exposes them under distinct names instead. Consumers
// rename back to their original local variable at the destructure site
// (e.g. `const { collectionNames: collections } = useCollectionsContext()`)
// so the rest of each file's code needs no changes beyond that one line.
export function CollectionsProvider({ children }) {
  const { chapters, refetch: refetchChapters } = useChapters();
  const { collections: collectionNames, loading: collectionNamesLoading, refetch: refetchCollectionNames } = useCollections();
  const { collections: collectionObjects, loading: collectionObjectsLoading, refetch: refetchCollectionObjects } = useCollectionObjects();

  const value = {
    chapters, refetchChapters,
    collectionNames, collectionNamesLoading, refetchCollectionNames,
    collectionObjects, collectionObjectsLoading, refetchCollectionObjects,
  };

  return <CollectionsContext.Provider value={value}>{children}</CollectionsContext.Provider>;
}

export function useCollectionsContext() {
  const ctx = useContext(CollectionsContext);
  if (!ctx) throw new Error('useCollectionsContext must be used within a CollectionsProvider');
  return ctx;
}
