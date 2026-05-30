"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { motion } from "framer-motion";
import { ReactNode } from "react";

interface Props {
  children: ReactNode;
  content: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
}

export function Tooltip({
  children,
  content,
  side = "top",
  sideOffset = 4,
}: Props) {
  const getAnimation = () => {
    switch (side) {
      case "top":    return { initial: { opacity: 0, y: 3 }, animate: { opacity: 1, y: 0 } };
      case "bottom": return { initial: { opacity: 0, y: -3 }, animate: { opacity: 1, y: 0 } };
      case "left":   return { initial: { opacity: 0, x: 3 }, animate: { opacity: 1, x: 0 } };
      case "right":  return { initial: { opacity: 0, x: -3 }, animate: { opacity: 1, x: 0 } };
      default:       return { initial: { opacity: 0 }, animate: { opacity: 1 } };
    }
  };

  const animation = getAnimation();

  return (
    <TooltipPrimitive.Provider delayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          {children}
        </TooltipPrimitive.Trigger>

        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={sideOffset}
            collisionPadding={6}
            className="z-50"
          >
            <motion.div
              initial={animation.initial}
              animate={animation.animate}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="bg-slate-900 text-white text-[9.5px] font-normal px-1.5 py-0.5 rounded shadow-md border border-slate-800"
            >
              {content}
            </motion.div>
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}