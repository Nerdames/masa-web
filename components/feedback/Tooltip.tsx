"use client";

import * as RadixTooltip from "@radix-ui/react-tooltip";
import { motion, AnimatePresence } from "framer-motion";
import { ReactNode } from "react";

interface TooltipProps {
  content: string | ReactNode;
  children: ReactNode;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, className }) => {
  return (
    <RadixTooltip.Provider delayDuration={150}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>

        <RadixTooltip.Portal>
          <RadixTooltip.Content side="right" align="center" sideOffset={6} asChild>
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -2 }}
                transition={{ duration: 0.15 }}
                className={`
                  relative whitespace-nowrap rounded-md bg-black px-2.5 py-1 text-xs text-white shadow-lg
                  ${className ?? ""}
                `}
              >
                {content}
                <RadixTooltip.Arrow className="fill-black" width={6} height={6} />
              </motion.div>
            </AnimatePresence>
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
};
