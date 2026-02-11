"use client";

import React, { useState, ReactNode } from "react";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import { FeatureWorkspace } from "@/components/layout/FeatureWorkspace";
import { FeatureTab } from "@/components/layout/FeatureTabBar";

interface Props<T extends FeatureTab = FeatureTab> {
  children?: ReactNode;
  workspaceTabs?: T[];
  renderTabContent?: (tab: T) => ReactNode;
  createNewTab?: () => T;
}

export default function DashboardRootLayout<T extends FeatureTab = FeatureTab>({
  children,
  workspaceTabs,
  renderTabContent,
  createNewTab,
}: Props<T>) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* TopBar */}
      <div className="flex-shrink-0">
        <TopBar />
      </div>

      {/* Content area: Sidebar + Main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main content */}
        <main className="flex-1 overflow-hidden bg-white mx-1">
          {workspaceTabs && renderTabContent && createNewTab ? (
            <FeatureWorkspace<T>
              initialTabs={workspaceTabs}
              renderTabContent={renderTabContent}
              createNewTab={createNewTab}
            />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
