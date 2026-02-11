"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { motion, AnimatePresence } from "framer-motion";

/* ---------------------------------------------
 * Constants
 * ------------------------------------------- */
const ACTIVE_BG = "#ffffff";
const INACTIVE_BG = "#f3f3f3";
const HOVER_BG = "#e8e8e8";

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

/* ---------------------------------------------
 * Types
 * ------------------------------------------- */
export type FeatureTab = {
  id: string;
  title: string;
  pinned?: boolean;
  icon?: React.ReactNode;
};

export type ContextMenuAction =
  | "new"
  | "close"
  | "close-right"
  | "close-all"
  | "reload"
  | string; // allow custom actions

export type ExtraAction<T extends FeatureTab> = {
  label: string;
  action: string; // unique identifier
  onClick: (tab: T) => void;
  disabled?: boolean;
};

export type FeatureTabBarProps<T extends FeatureTab> = {
  tabs: T[];
  activeTabId: string;
  setActiveTabId: (id: string) => void;
  createNewTab: () => void;
  requestCloseTab: (tab: T) => void;
  onReloadTab?: (tab: T) => void;
  onDragEnd: (result: DropResult) => void;
  minTabWidth?: number;
  maxTabWidth?: number;
  renderTabIcon?: (tab: T) => React.ReactNode;
  extraActions?: ExtraAction<T>[];
  isMaxReached: boolean; // 👈 add this
};

/* ---------------------------------------------
 * Menu Components
 * ------------------------------------------- */
function Separator() {
  return <div className="my-1 h-px bg-[#e5e5e5]" />;
}

function MenuItem({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      onClick={!disabled ? onClick : undefined}
      className={[
        "px-3 py-2 select-none text-[13px] cursor-pointer",
        disabled ? "text-[#aaa] cursor-not-allowed" : "hover:bg-[#f3f3f3]",
      ].join(" ")}
    >
      {label}
    </div>
  );
}

function TabContextMenu<T extends FeatureTab>({
  x,
  y,
  tab,
  hasRightTabs,
  onAction,
  onClose,
  extraActions = [],
  isMaxReached,
}: {
  x: number;
  y: number;
  tab: T;
  hasRightTabs: boolean;
  onAction: (a: ContextMenuAction) => void;
  onClose: () => void;
  extraActions?: ExtraAction<T>[];
  isMaxReached: boolean; // ✅ this is correctly passed down from FeatureTabBar

}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setSize({ w: r.width, h: r.height });
  }, []);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const MARGIN = 8;
  const fitsBelow = y + size.h + MARGIN <= window.innerHeight;
  const top = fitsBelow ? y : y - size.h;
  const left = clamp(x, MARGIN, window.innerWidth - size.w - MARGIN);
  const clampedTop = clamp(top, MARGIN, window.innerHeight - size.h - MARGIN);

  return (
    <AnimatePresence>
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale: 0.96, y: fitsBelow ? -4 : 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: fitsBelow ? -4 : 4 }}
        transition={{ type: "spring", stiffness: 420, damping: 28 }}
        style={{ top: clampedTop, left }}
        onClick={(e) => e.stopPropagation()}
        className="fixed z-[100] w-56 rounded-md border border-[#e5e5e5] bg-white shadow-xl py-1"
      >
        <MenuItem label="New tab" onClick={() => onAction("new")} disabled={isMaxReached} />
        <Separator />
        <MenuItem label="Reload tab" onClick={() => onAction("reload")} disabled={false} />
        <Separator />
        <MenuItem
          label="Close tab"
          disabled={tab.pinned}
          onClick={() => onAction("close")}
        />
        <MenuItem
          label="Close tabs to the right"
          disabled={tab.pinned || !hasRightTabs}
          onClick={() => onAction("close-right")}
        />
        <Separator />
        <MenuItem label="Close all tabs" onClick={() => onAction("close-all")} />
        {extraActions.length > 0 && <Separator />}
        {extraActions.map((a) => (
          <MenuItem
            key={a.action}
            label={a.label}
            onClick={() => {
              a.onClick(tab);
              onClose();
            }}
            disabled={a.disabled}
          />
        ))}
      </motion.div>
    </AnimatePresence>
  );
}

/* ---------------------------------------------
 * FeatureTabBar Component
 * ------------------------------------------- */
export function FeatureTabBar<T extends FeatureTab>({
  tabs,
  activeTabId,
  setActiveTabId,
  createNewTab,
  requestCloseTab,
  onReloadTab,
  onDragEnd,
  minTabWidth = 96,
  maxTabWidth = 160,
  renderTabIcon,
  extraActions = [],
}: FeatureTabBarProps<T>) {
  const [containerWidth, setContainerWidth] = useState(1200);
  const [menu, setMenu] = useState<{ tab: T; x: number; y: number } | null>(
    null
  );

  useEffect(() => {
    const updateWidth = () => {
      const el = document.getElementById("feature-tab-bar");
      if (el) setContainerWidth(el.offsetWidth - 36);
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [tabs.length]);

  const tabWidth = Math.max(
    minTabWidth,
    Math.min(maxTabWidth, Math.floor(containerWidth / tabs.length))
  );

    const MAX_TABS = 12;
    const isMaxReached = tabs.length >= MAX_TABS;



  const handleMenuAction = (action: ContextMenuAction) => {
    if (!menu) return;
    const tab = menu.tab;

    switch (action) {
      case "new":
        if (!isMaxReached) createNewTab();
        break;
      case "reload":
        if (onReloadTab) onReloadTab(tab);
        break;
      case "close":
        requestCloseTab(tab);
        break;
      case "close-right": {
        const index = tabs.findIndex((t) => t.id === tab.id);
        tabs
          .slice(index + 1)
          .filter((t) => !t.pinned)
          .forEach((t) => requestCloseTab(t));
        break;
      }
      case "close-all":
        tabs.filter((t) => !t.pinned).forEach((t) => requestCloseTab(t));
        break;
      default:
        const extra = extraActions.find((a) => a.action === action);
        if (extra) extra.onClick(tab);
    }

    setMenu(null);
  };

  return (
    <div
      id="feature-tab-bar"
      className="sticky top-0 z-20 bg-[#f5f5f5] border-b border-[#e5e5e5]"
    >
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="tabs" direction="horizontal">
          {(p) => (
            <div className="relative flex-1 overflow-hidden">
              <motion.div
                ref={p.innerRef}
                {...p.droppableProps}
                className="flex h-[34px]"
                layout
              >
                <AnimatePresence initial={false}>
                  {tabs.map((tab, index) => {
                    const isActive = tab.id === activeTabId;
                    const hasRightTabs = index < tabs.length - 1;

                    return (
                      <Draggable
                        key={tab.id}
                        draggableId={tab.id}
                        index={index}
                        isDragDisabled={tab.pinned}
                      >
                        {(d, snapshot) => {
                          if (snapshot.isDragging && !isActive) {
                            setActiveTabId(tab.id);
                          }

                          return (
                            <motion.div
                              ref={d.innerRef}
                              {...d.draggableProps}
                              {...d.dragHandleProps}
                              layout
                              onClick={() => setActiveTabId(tab.id)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setMenu({ tab, x: e.clientX, y: e.clientY });
                              }}
                              initial={{ opacity: 0 }}
                              animate={{
                                opacity: 1,
                                width: tabWidth,
                                y: isActive ? -1 : 0,
                                backgroundColor: isActive ? ACTIVE_BG : INACTIVE_BG,
                                color: isActive ? "#111" : "#555",
                                boxShadow: snapshot.isDragging
                                  ? "0 4px 12px rgba(0,0,0,0.15)"
                                  : isActive
                                  ? "0 2px 6px rgba(0,0,0,0.12)"
                                  : "none",
                              }}
                              whileHover={
                                isActive
                                  ? undefined
                                  : { y: -1, backgroundColor: HOVER_BG }
                              }
                              transition={{ type: "spring", stiffness: 380, damping: 30 }}
                              className={[
                                "group relative h-[34px] px-2 flex items-center",
                                "text-[13px] select-none truncate cursor-pointer",
                                isActive ? "rounded-t-lg z-10" : "z-0",
                              ].join(" ")}
                            >
                              {/* Icon */}
                              <span className="mr-2 w-4 h-4 flex items-center justify-center cursor-pointer">
                                {renderTabIcon ? renderTabIcon(tab) : tab.icon}
                              </span>

                              {/* Title */}
                              <span className="truncate flex-1 cursor-pointer">{tab.title}</span>

                              {/* Close button */}
                              {!tab.pinned && (
                                <span
                                  className="ml-2 w-4 h-4 flex items-center justify-center cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    requestCloseTab(tab);
                                  }}
                                >
                                  <i className="bx bx-x opacity-0 group-hover:opacity-100" />
                                </span>
                              )}

                              {/* Tab ↔ page connection */}
                              {isActive && (
                                <motion.div
                                  layoutId="tab-connection"
                                  className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-white"
                                />
                              )}
                            </motion.div>
                          );
                        }}
                      </Draggable>
                    );
                  })}
                </AnimatePresence>

                {p.placeholder}

            {/* New tab button */}
            <motion.div
            onClick={!isMaxReached ? createNewTab : undefined}
            title={isMaxReached ? "Maximum tabs reached" : "New tab"}
            className={[
                "h-[34px] w-[36px] flex items-center justify-center",
                "text-[#555] transition-colors",
                isMaxReached
                ? "opacity-40 cursor-not-allowed"
                : "cursor-pointer hover:bg-[#eaeaea]",
            ].join(" ")}
            whileHover={!isMaxReached ? { scale: 1.1 } : undefined}
            whileTap={!isMaxReached ? { scale: 0.95 } : undefined}
            >
            <i className="bx bx-plus text-lg" />
            </motion.div>

              </motion.div>

              {/* Overflow fade */}
              <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-[#f3f3f3] to-transparent" />
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {menu && (
        <TabContextMenu
          x={menu.x}
          y={menu.y}
          tab={menu.tab}
          hasRightTabs={tabs.findIndex((t) => t.id === menu.tab.id) < tabs.length - 1}
          onAction={handleMenuAction}
          onClose={() => setMenu(null)}
          extraActions={extraActions}
          isMaxReached={isMaxReached}
        />
      )}
    </div>
  );
}
