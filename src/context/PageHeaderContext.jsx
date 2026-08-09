import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const defaultHeader = {
  title: '',
  breadcrumbs: [],
  actions: null,
  hideSearch: false,
};

const PageHeaderContext = createContext(null);

export function PageHeaderProvider({ children }) {
  const [header, setHeaderState] = useState(defaultHeader);

  const setHeader = useCallback((partial) => {
    setHeaderState((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetHeader = useCallback(() => {
    setHeaderState(defaultHeader);
  }, []);

  const value = useMemo(
    () => ({ header, setHeader, resetHeader }),
    [header, setHeader, resetHeader],
  );

  return (
    <PageHeaderContext.Provider value={value}>
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeaderContext() {
  const ctx = useContext(PageHeaderContext);
  if (!ctx) {
    throw new Error('usePageHeaderContext must be used within PageHeaderProvider');
  }
  return ctx;
}

/** Register page chrome on mount; clears on unmount. */
export function usePageHeader({ title, breadcrumbs, actions, hideSearch } = {}) {
  const { setHeader, resetHeader } = usePageHeaderContext();

  React.useEffect(() => {
    setHeader({
      title: title || '',
      breadcrumbs: breadcrumbs || [],
      actions: actions ?? null,
      hideSearch: !!hideSearch,
    });
    return resetHeader;
  }, [title, breadcrumbs, actions, hideSearch, setHeader, resetHeader]);
}
