"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { motion, AnimatePresence } from "framer-motion";
import { OrderTab } from "./OrderTab";

const ACTIVE_COLOR = "#00A63E";
const DRAG_BG_COLOR = "#00A63E";

/* ---------------------------------------------
 * Types
 * ------------------------------------------- */
type Props = {
  tabs: OrderTab[];
  activeTabId: string;
  setActiveTabId: (id: string) => void;
  createNewOrderTab: () => void;
  requestCloseTab: (tab: OrderTab) => void;
  onDragEnd: (result: DropResult) => void;
  minTabWidth?: number;
  maxTabWidth?: number;
};

type ContextMenuAction = "new" | "close" | "close-right" | "close-all";

/* ---------------------------------------------
 * Utils
 * ------------------------------------------- */
const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

/* ---------------------------------------------
 * Context Menu Components
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
        "px-3 py-2 select-none text-[13px]",
        disabled
          ? "text-[#aaa] cursor-not-allowed"
          : "cursor-pointer hover:bg-[#f3f3f3]",
      ].join(" ")}
    >
      {label}
    </div>
  );
}

function TabContextMenu({
  x,
  y,
  tab,
  hasRightTabs,
  onAction,
  onClose,
}: {
  x: number;
  y: number;
  tab: OrderTab;
  hasRightTabs: boolean;
  onAction: (a: ContextMenuAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  /* Measure menu dynamically */
  useLayoutEffect(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setSize({ w: r.width, h: r.height });
  }, []);

  /* Dismiss menu on click outside or Escape */
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
        className="fixed z-[100] w-56 rounded-md border border-[#e5e5e5]
                   bg-white shadow-xl py-1"
      >
        <MenuItem label="New tab" onClick={() => onAction("new")} />
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
      </motion.div>
    </AnimatePresence>
  );
}

/* ---------------------------------------------
 * OrdersTabBar
 * ------------------------------------------- */
export default function OrdersTabBar({
  tabs,
  activeTabId,
  setActiveTabId,
  createNewOrderTab,
  requestCloseTab,
  onDragEnd,
  minTabWidth = 96,
  maxTabWidth = 160,
}: Props) {
  const [containerWidth, setContainerWidth] = useState(1200);
  const [menu, setMenu] = useState<{ tab: OrderTab; x: number; y: number } | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);

  /* Update container width on resize */
  useEffect(() => {
    const updateWidth = () => {
      const el = document.getElementById("orders-tab-bar");
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

  const rightTabsCount = menu
    ? Math.max(0, tabs.length - tabs.findIndex((t) => t.id === menu.tab.id) - 1)
    : 0;

  const handleMenuAction = (action: ContextMenuAction) => {
    if (!menu) return;
    const index = tabs.findIndex((t) => t.id === menu.tab.id);

    switch (action) {
      case "new":
        createNewOrderTab();
        break;
      case "close":
        requestCloseTab(menu.tab);
        break;
      case "close-right":
        tabs.slice(index + 1).filter((t) => !t.pinned).forEach(requestCloseTab);
        break;
      case "close-all":
        tabs.filter((t) => !t.pinned).forEach(requestCloseTab);
        break;
    }

    setMenu(null);
  };

  return (
    <div
      id="orders-tab-bar"
      className="sticky top-0 z-50 bg-[#f3f3f3] border-b border-[#e5e5e5]"
    >
      <DragDropContext
        onDragEnd={(result) => {
          setDraggingTabId(null);
          onDragEnd(result);
          if (result.destination) setActiveTabId(result.draggableId);
        }}
      >
        <Droppable droppableId="tabs" direction="horizontal">
          {(p) => (
            <motion.div ref={p.innerRef} {...p.droppableProps} className="flex h-[34px]" layout>
              <AnimatePresence initial={false}>
                {tabs.map((tab, index) => {
                  const active = tab.id === activeTabId;
                  const isDragging = draggingTabId === tab.id;

                  return (
                    <Draggable key={tab.id} draggableId={tab.id} index={index} isDragDisabled={tab.pinned}>
                      {(d, snapshot) => {
                        if (snapshot.isDragging && draggingTabId !== tab.id) {
                          setDraggingTabId(tab.id);
                        }

                        return (
                          <motion.div
                            ref={d.innerRef}
                            {...d.draggableProps}
                            {...d.dragHandleProps}
                            layout
                            style={{ width: tabWidth, pointerEvents: snapshot.isDragging ? "none" : "auto" }}
                            onClick={() => setActiveTabId(tab.id)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation(); // critical for DnD
                              setMenu({ tab, x: e.clientX, y: e.clientY });
                            }}
                            initial={{ opacity: 0 }}
                            animate={{
                              scale: snapshot.isDragging ? 1.05 : 1,
                              opacity: 1,
                              backgroundColor: active || isDragging ? ACTIVE_COLOR : "#f3f3f3",
                              color: active || isDragging ? "#fff" : "#555",
                            }}
                            exit={{ opacity: 0 }}
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                            className="group relative h-[34px] px-2 flex items-center text-[13px] select-none border-r border-[#e5e5e5] truncate cursor-pointer"
                          >
                            <span className="mr-2 w-4 h-4 flex items-center justify-center">
                              <i className="bx bx-cart text-sm" />
                            </span>

                            <span className="truncate flex-1">{tab.title}</span>

                            {!tab.pinned && (
                              <span
                                className="ml-2 w-4 h-4 relative flex items-center justify-center"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  requestCloseTab(tab);
                                }}
                              >
                                {tab.dirty ? (
                                  <>
                                    <i
                                      className={`bx bxs-circle absolute text-[8px] ${
                                        active ? "text-white" : "text-[#555]"
                                      } group-hover:opacity-0`}
                                    />
                                    <i className="bx bx-x absolute opacity-0 group-hover:opacity-100" />
                                  </>
                                ) : (
                                  <i className="bx bx-x opacity-0 group-hover:opacity-100" />
                                )}
                              </span>
                            )}
                          </motion.div>
                        );
                      }}
                    </Draggable>
                  );
                })}
              </AnimatePresence>

              <motion.div
                onClick={createNewOrderTab}
                className="h-[34px] w-[36px] flex items-center justify-center cursor-pointer text-[#555] hover:bg-[#eaeaea] rounded"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                <i className="bx bx-plus text-lg" />
              </motion.div>

              {p.placeholder}
            </motion.div>
          )}
        </Droppable>
      </DragDropContext>

      {menu && (
        <TabContextMenu
          x={menu.x}
          y={menu.y}
          tab={menu.tab}
          hasRightTabs={rightTabsCount > 0}
          onAction={handleMenuAction}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
