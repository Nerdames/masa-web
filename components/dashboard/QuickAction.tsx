"use client";

import { FC, ReactNode, useRef, useState, useEffect } from "react";
import Link from "next/link";
import { Tooltip } from "@/components/feedback/Tooltip";

export interface QuickActionProps {
  label: string;
  href: string;
  icon?: ReactNode;
  active?: boolean;
  external?: boolean;
}

const QuickAction: FC<QuickActionProps> = ({
  label,
  href,
  icon,
  active = false,
  external = false,
}) => {
  const containerRef = useRef<HTMLAnchorElement | HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const [visibleChars, setVisibleChars] = useState(label.length);
  const [truncated, setTruncated] = useState(false);

  // Dynamically adjust visible characters
  useEffect(() => {
    const updateVisibility = () => {
      if (!containerRef.current || !labelRef.current) return;

      const containerWidth = containerRef.current.clientWidth;
      const iconWidth = icon ? 20 : 0; // icon width
      const padding = 8; // px padding left+right
      const availableWidth = containerWidth - iconWidth - padding;

      if (availableWidth <= 0) {
        setVisibleChars(0);
        setTruncated(true);
        return;
      }

      const charWidth = 7; // average width per character
      const maxChars = Math.floor(availableWidth / charWidth);
      setVisibleChars(maxChars > label.length ? label.length : maxChars);
      setTruncated(maxChars < label.length);
    };

    updateVisibility();
    window.addEventListener("resize", updateVisibility);
    return () => window.removeEventListener("resize", updateVisibility);
  }, [label, icon]);

  const baseClasses =
    "px-2 py-1 flex items-center gap-1 rounded-lg border border-gray-200 bg-white text-sm transition-all duration-200 ease-in-out whitespace-nowrap overflow-hidden";

  const stateClasses = active
    ? "bg-green-700 text-white opacity-95 scale-100"
    : "text-gray-700 hover:bg-green-700 hover:text-white hover:opacity-90 hover:scale-105 active:opacity-80 active:scale-100";

  const content = (
    <div className="flex items-center gap-1 transition-all duration-150 ease-in-out">
      {icon && <span className="flex-shrink-0 text-base">{icon}</span>}
      {visibleChars > 0 && (
        <span
          ref={labelRef}
          className="flex-shrink truncate text-sm"
          style={{ maxWidth: `${visibleChars}ch` }}
        >
          {truncated
            ? `${label.slice(0, visibleChars - 1)}…` // add ellipsis if truncated
            : label.slice(0, visibleChars)}
        </span>
      )}
    </div>
  );

  const wrappedContent =
    truncated || visibleChars === 0 ? (
      <Tooltip content={label} side="bottom" sideOffset={4}>
        {content}
      </Tooltip>
    ) : (
      content
    );

  if (external) {
    return (
      <a
        href={href}
        ref={containerRef as React.Ref<HTMLAnchorElement>}
        className={`${baseClasses} ${stateClasses}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
      >
        {wrappedContent}
      </a>
    );
  }

  return (
    <Link
      href={href}
      ref={containerRef as React.Ref<HTMLDivElement>}
      className={`${baseClasses} ${stateClasses}`}
      aria-current={active ? "page" : undefined}
    >
      {wrappedContent}
    </Link>
  );
};

export default QuickAction;