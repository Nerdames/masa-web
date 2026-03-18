"use client";

import React, { createContext, useContext, useState, ReactNode, useCallback } from "react";

interface SidePanelContextType {
  isOpen: boolean;
  content: ReactNode | null;
  openPanel: (content: ReactNode) => void;
  closePanel: () => void;
}

const SidePanelContext = createContext<SidePanelContextType | undefined>(undefined);

export function SidePanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState<ReactNode | null>(null);

  const openPanel = useCallback((newContent: ReactNode) => {
    setContent(newContent);
    setIsOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setIsOpen(false);
    // Timeout matches the exit transition duration
    setTimeout(() => setContent(null), 300);
  }, []);

  return (
    <SidePanelContext.Provider value={{ isOpen, content, openPanel, closePanel }}>
      {children}
    </SidePanelContext.Provider>
  );
}

export const useSidePanel = () => {
  const context = useContext(SidePanelContext);
  if (!context) {
    throw new Error("useSidePanel must be used within a SidePanelProvider");
  }
  return context;
};