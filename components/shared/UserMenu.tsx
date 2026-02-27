"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import ConfirmModal from "@/components/modal/ConfirmModal";

interface UserMenuProps {
  trigger?: React.ReactNode;
}

export function UserMenu({ trigger }: UserMenuProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const getInitials = (name?: string | null) => {
    if (!name) return "AP";
    const parts = name.trim().split(" ");
    return parts.length === 1
      ? parts[0][0].toUpperCase()
      : `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  };

  if (!user) return null;

  const { name, email, organizationName, branchName, role } = user;

  const handleSignOut = async () => {
    setLoading(true);
    await signOut({ callbackUrl: "/" });
    setLoading(false);
  };

  return (
    <>
      <DropdownMenu.Root open={open} onOpenChange={setOpen}>
        {/* Trigger */}
        <DropdownMenu.Trigger asChild>
          {trigger ?? (
            <button
              aria-label="User menu"
              className="w-8 h-8 rounded-full bg-gray-900 text-white
                         flex items-center justify-center text-sm font-semibold
                         hover:bg-gray-800 transition-colors"
            >
              {getInitials(name)}
            </button>
          )}
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal forceMount>
          <AnimatePresence>
            {open && (
              <DropdownMenu.Content
                asChild
                align="end"
                sideOffset={6}
                className="z-50 outline-none"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{
                    type: "spring",
                    stiffness: 320,
                    damping: 22,
                  }}
                  className="bg-white/95 backdrop-blur-xl border border-gray-200
                             rounded-2xl shadow-xl w-60 p-0 overflow-hidden"
                >
                  {/* User Card */}
                  <div
                    className="flex flex-col items-start gap-2 p-4 mb-2 rounded-xl bg-gray-50
                               hover:bg-gray-100 cursor-pointer transition-colors"
                    onClick={() => {
                      setOpen(false);
                      router.push("/dashboard/settings/profile");
                    }}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <div
                        className="w-12 h-12 rounded-full bg-gray-900 text-white
                                   flex items-center justify-center font-semibold text-lg"
                      >
                        {getInitials(name)}
                      </div>
                      <div className="flex flex-col truncate">
                        <span className="text-sm font-medium truncate">{name}</span>
                        <span className="text-xs text-gray-500 truncate">
                          {email}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-col text-xs text-gray-500 space-y-1">
                      {organizationName && <span>{organizationName}</span>}
                      {branchName && <span>{branchName}</span>}
                      {role && <span className="italic">{role}</span>}
                    </div>
                  </div>

                  <DropdownMenu.Separator className="my-1 h-px bg-gray-200" />

                  {/* Profile */}
                  <DropdownMenu.Item asChild>
                    <button
                      onClick={() => {
                        setOpen(false);
                        router.push("/dashboard/settings/profile");
                      }}
                      className="w-full text-left px-4 py-2 text-sm rounded hover:bg-gray-100 flex items-center gap-2"
                    >
                      <i className="bx bx-user text-[16px]" />
                      Manage your profile
                    </button>
                  </DropdownMenu.Item>

                  {/* Settings */}
                  <DropdownMenu.Item asChild>
                    <button
                      onClick={() => {
                        setOpen(false);
                        router.push("/dashboard/settings");
                      }}
                      className="w-full text-left px-4 py-2 text-sm rounded hover:bg-gray-100 flex items-center gap-2"
                    >
                      <i className="bx bx-cog text-[16px]" />
                      Settings
                    </button>
                  </DropdownMenu.Item>

                  <DropdownMenu.Separator className="my-1 h-px bg-gray-200" />

                  {/* Sign Out */}
                  <DropdownMenu.Item asChild>
                    <button
                      onClick={() => {
                        setOpen(false);
                        setConfirmOpen(true);
                      }}
                      className="w-full text-left px-4 py-2 text-sm rounded hover:bg-red-50 text-red-600 flex items-center gap-2"
                    >
                      <i className="bx bx-log-out text-[16px]" />
                      Sign Out
                    </button>
                  </DropdownMenu.Item>
                </motion.div>
              </DropdownMenu.Content>
            )}
          </AnimatePresence>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* Confirm Modal */}
      <ConfirmModal
        open={confirmOpen}
        title="Confirm Sign Out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign Out"
        destructive
        loading={loading}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleSignOut}
      />
    </>
  );
}