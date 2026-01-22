"use client";

import React, { useState } from "react";
import { SwitchField } from "@/components/shared/SwitchField";

/* ===============================
   SCHEMA-ALIGNED TYPES
   =============================== */

interface OrganizationSettings {
  id: string;
  name: string;
  active: boolean;
}

interface BranchSettings {
  id: string;
  name: string;
  location?: string;
  active: boolean;
}

/* ===============================
   COMPONENT
   =============================== */

export default function GeneralSettingsPage(): JSX.Element {
  const [organization, setOrganization] = useState<OrganizationSettings>({
    id: "org_123",
    name: "MASA Inc.",
    active: true,
  });

  const [branch, setBranch] = useState<BranchSettings>({
    id: "branch_123",
    name: "Main Branch",
    location: "Lagos",
    active: true,
  });

  const [isSaving, setIsSaving] = useState(false);

  const updateOrganization = <K extends keyof OrganizationSettings>(
    key: K,
    value: OrganizationSettings[K]
  ) => setOrganization(prev => ({ ...prev, [key]: value }));

  const updateBranch = <K extends keyof BranchSettings>(
    key: K,
    value: BranchSettings[K]
  ) => setBranch(prev => ({ ...prev, [key]: value }));

  const handleOrganizationActiveToggle = async (next: boolean) => {
    const previous = organization.active;
    updateOrganization("active", next);
    setIsSaving(true);

    try {
      const res = await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: next }),
      });
      if (!res.ok) throw new Error("Failed to update organization");

      fetch("/api/activity-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ORGANIZATION_STATUS_CHANGED",
          meta: JSON.stringify({ from: previous, to: next }),
        }),
      }).catch(console.error);
    } catch (error) {
      updateOrganization("active", previous);
      console.error(error);
      alert("Failed to update organization status");
    } finally {
      setIsSaving(false);
    }
  };

  const handleBranchActiveToggle = async (next: boolean) => {
    const previous = branch.active;
    updateBranch("active", next);
    setIsSaving(true);

    try {
      const res = await fetch("/api/branch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: next }),
      });
      if (!res.ok) throw new Error("Failed to update branch");

      fetch("/api/activity-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "BRANCH_STATUS_CHANGED",
          meta: JSON.stringify({ branchId: branch.id, from: previous, to: next }),
        }),
      }).catch(console.error);
    } catch (error) {
      updateBranch("active", previous);
      console.error(error);
      alert("Failed to update branch status");
    } finally {
      setIsSaving(false);
    }
  };

  /* ===============================
     UI
     =============================== */

  return (
    <div className="max-w-3xl mx-auto space-y-10">
      <h1 className="text-2xl font-bold">General Settings</h1>

      <form
        onSubmit={e => {
          e.preventDefault();
          console.log("Organization:", organization);
          console.log("Branch:", branch);
          alert("Settings saved (mock)");
        }}
        className="space-y-10"
      >
        {/* =========================
            ORGANIZATION SETTINGS
           ========================= */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Organization</h2>

          <div>
            <label className="block text-sm font-medium mb-1">
              Organization Name
            </label>
            <input
              type="text"
              value={organization.name}
              onChange={e => updateOrganization("name", e.target.value)}
              className="w-full border rounded px-3 py-2"
              disabled={isSaving}
            />
          </div>

          {/* Tooltip wrapper */}
          <div className="relative group inline-block">
            <SwitchField
              label="Organization Active"
              description="Toggle to activate or deactivate the organization"
              checked={organization.active}
              disabled={isSaving}
              onChange={handleOrganizationActiveToggle}
            />
            {/* Tooltip */}
            <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-max max-w-xs bg-gray-700 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
              Activating will allow users to access organization resources.
            </div>
          </div>
        </section>

        {/* =========================
            BRANCH SETTINGS
           ========================= */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Branch</h2>

          <div>
            <label className="block text-sm font-medium mb-1">Branch Name</label>
            <input
              type="text"
              value={branch.name}
              onChange={e => updateBranch("name", e.target.value)}
              className="w-full border rounded px-3 py-2"
              disabled={isSaving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Location</label>
            <input
              type="text"
              value={branch.location ?? ""}
              onChange={e => updateBranch("location", e.target.value)}
              className="w-full border rounded px-3 py-2"
              disabled={isSaving}
            />
          </div>

          {/* Tooltip wrapper */}
          <div className="relative group inline-block">
            <SwitchField
              label="Branch Active"
              description="Toggle to activate or deactivate this branch"
              checked={branch.active}
              disabled={isSaving}
              onChange={handleBranchActiveToggle}
            />
            {/* Tooltip */}
            <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-max max-w-xs bg-gray-700 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
              Activating allows branch users to manage stock and orders.
            </div>
          </div>
        </section>

        {/* =========================
            SAVE BUTTON
           ========================= */}
        <div className="pt-4">
          <button
            type="submit"
            className="px-4 py-2 rounded bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isSaving}
          >
            Save Settings
          </button>
        </div>
      </form>
    </div>
  );
}
