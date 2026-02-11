"use client";

import * as RadixTooltip from "@radix-ui/react-tooltip";
import { motion } from "framer-motion";
import { ReactNode } from "react";

interface TooltipProps {
  content: string | ReactNode;
  children: ReactNode;
  className?: string;
  sideOffset?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  className,
  sideOffset = 6,
}) => {
  return (
    <RadixTooltip.Provider delayDuration={150}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>

        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side="top" // default side
            align="center"
            sideOffset={sideOffset}
            collisionDetection
            asChild
          >
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 2 }}
              transition={{ duration: 0.15 }}
              className={`
                relative whitespace-nowrap rounded-md bg-black px-2.5 py-1 text-xs text-white shadow-lg
                z-[9999]
                data-[side='top']:-translate-y-1
                data-[side='bottom']:translate-y-1
                data-[side='left']:translate-x-1
                data-[side='right']:-translate-x-1
                ${className ?? ""}
              `}
            >
              {content}
              <RadixTooltip.Arrow className="fill-black" width={6} height={6} />
            </motion.div>
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
};
