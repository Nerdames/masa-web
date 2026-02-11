"use client";

import React, { useState, useEffect } from "react";
import { DropResult } from "@hello-pangea/dnd";
import { FeatureTabBar, FeatureTab, ContextMenuAction } from "./FeatureTabBar";
import { Tooltip } from "@/components/feedback/Tooltip"; // ✅ import Tooltip component

export type FeatureWorkspaceProps<T extends FeatureTab> = {
  initialTabs: T[];
  renderTabContent: (tab: T) => React.ReactNode;
  createNewTab: () => T;
  onReloadTab?: (tab: T) => void;
  extraActions?: {
    label: string;
    action: string;
    onClick: (tab: T) => void;
    disabled?: boolean;
  }[];
  maxTabs?: number; // maximum allowed tabs
  storageKey?: string; // optional key for localStorage persistence
};

/**
 * FeatureWorkspace
 * ----------------
 * Generic workspace with tabs + content, supports max tabs limit with tooltip
 * Optional localStorage persistence for tabs + active tab
 */
export function FeatureWorkspace<T extends FeatureTab>({
  initialTabs,
  renderTabContent,
  createNewTab,
  onReloadTab,
  extraActions = [],
  maxTabs = 10,
  storageKey,
}: FeatureWorkspaceProps<T>) {
  const [tabs, setTabs] = useState<T[]>(initialTabs);
  const [activeTabId, setActiveTabId] = useState<string>(initialTabs[0]?.id || "");
  const [showTooltip, setShowTooltip] = useState(false);

  const isMaxReached = tabs.length >= maxTabs;

  /* ----------------------------
     Load tabs + active tab from localStorage
  ---------------------------- */
  useEffect(() => {
    if (!storageKey) return;

    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed: { tabs: T[]; activeTabId?: string } = JSON.parse(raw);
        const mergedTabs = [
          ...initialTabs,
          ...parsed.tabs.filter((t) => !initialTabs.find((it) => it.id === t.id)),
        ];
        setTabs(mergedTabs);

        if (parsed.activeTabId && mergedTabs.find((t) => t.id === parsed.activeTabId)) {
          setActiveTabId(parsed.activeTabId);
        } else {
          setActiveTabId(mergedTabs[0]?.id || "");
        }
      } catch (err) {
        console.warn("Failed to parse stored tabs:", err);
      }
    }
  }, [storageKey, initialTabs]);

  /* ----------------------------
     Save tabs + active tab to localStorage
  ---------------------------- */
  useEffect(() => {
    if (!storageKey) return;
    const payload = { tabs, activeTabId };
    localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [tabs, activeTabId, storageKey]);

  const addNewTab = () => {
    if (isMaxReached) {
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 1500);
      return;
    }
    const tab = createNewTab();
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const requestCloseTab = (tab: T) => {
    setTabs((prev) => prev.filter((t) => t.id !== tab.id));
    if (activeTabId === tab.id && tabs.length > 1) {
      const index = tabs.findIndex((t) => t.id === tab.id);
      const nextTab =
        tabs[index + 1] || tabs[index - 1] || tabs[0];
      setActiveTabId(nextTab?.id || "");
    }
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const newTabs = Array.from(tabs);
    const [moved] = newTabs.splice(result.source.index, 1);
    newTabs.splice(result.destination.index, 0, moved);
    setTabs(newTabs);
  };

  const handleTabAction = (tab: T, action: ContextMenuAction) => {
    if (action === "reload") onReloadTab?.(tab);
  };

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex flex-col h-full w-full bg-[#f5f5f5] relative">
      {/* Tab Bar */}
      <FeatureTabBar<T>
        tabs={tabs}
        activeTabId={activeTabId}
        setActiveTabId={setActiveTabId}
        createNewTab={addNewTab}
        requestCloseTab={requestCloseTab}
        onReloadTab={handleTabAction}
        onDragEnd={handleDragEnd}
        extraActions={extraActions}
        isMaxReached={isMaxReached} // ✅ pass max tabs info
      />

      {/* Tooltip for max tabs */}
      {showTooltip && (
        <div className="absolute top-10 right-4 z-50">
          <Tooltip content={`Maximum ${maxTabs} tabs reached`} side="top">
            <div />
          </Tooltip>
        </div>
      )}

      {/* Content */}
      <div
        className="flex-1 overflow-auto bg-white border-t border-[#e5e5e5] rounded-b-md"
        style={{ minHeight: 0 }}
      >
        {activeTab ? renderTabContent(activeTab) : null}
      </div>
    </div>
  );
}
