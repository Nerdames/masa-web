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
  sideOffset = 6,
}: Props) {
  // Direction-aware animation
  const getAnimation = () => {
    switch (side) {
      case "top":
        return { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 } };
      case "bottom":
        return { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 } };
      case "left":
        return { initial: { opacity: 0, x: 4 }, animate: { opacity: 1, x: 0 } };
      case "right":
        return { initial: { opacity: 0, x: -4 }, animate: { opacity: 1, x: 0 } };
      default:
        return { initial: { opacity: 0 }, animate: { opacity: 1 } };
    }
  };

  const animation = getAnimation();

  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          {children}
        </TooltipPrimitive.Trigger>

        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={sideOffset}
            collisionPadding={8}
            className="z-50"
          >
            <motion.div
              initial={animation.initial}
              animate={animation.animate}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="bg-black text-white text-xs px-2 py-1 rounded shadow"
            >
              {content}
            </motion.div>
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
