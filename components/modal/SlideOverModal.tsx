"use client";

import { useState, useEffect, ReactNode, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ConfirmModal from "./ConfirmModal";
import { useToast } from "../feedback/ToastProvider";

export interface FieldConfig {
  label: string;
  type?: "text" | "email" | "password";
  value: string;
  placeholder?: string;
  onChange: (val: string) => void;
  showStrength?: boolean;
}

interface SlideOverModalProps {
  open: boolean;
  title: string;
  fields?: FieldConfig[];
  onClose: () => void;
  actions?: ReactNode;
}

export default function SlideOverModal({
  open,
  title,
  fields = [],
  onClose,
  actions,
}: SlideOverModalProps) {
  const { addToast } = useToast();
  const [showConfirm, setShowConfirm] = useState(false);

  // Store initial values for reset
  const initialValuesRef = useRef(fields.map(f => f.value));
  // Store last values for undo
  const lastValuesRef = useRef<string[]>([]);
  // Keep a ref to current fields to avoid stale closures
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  useEffect(() => {
    if (open) {
      initialValuesRef.current = fields.map(f => f.value);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, fields]);

  const hasChanges = () =>
    fieldsRef.current.some((f, i) => f.value !== initialValuesRef.current[i]);

  const handleClose = () => {
    if (hasChanges()) setShowConfirm(true);
    else onClose();
  };

  const resetFields = () => {
    lastValuesRef.current = fieldsRef.current.map(f => f.value);
    fieldsRef.current.forEach((f, i) => f.onChange(initialValuesRef.current[i]));

    addToast({
      type: "info",
      message: "Fields reset to initial values",
      undo: {
        label: "Undo",
        onClick: () => {
          fieldsRef.current.forEach((f, i) => f.onChange(lastValuesRef.current[i]));
          addToast({ type: "success", message: "Undo successful" });
        },
      },
    });
  };

  const getPasswordStrength = (password: string) => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    switch (score) {
      case 0:
      case 1:
        return { label: "Weak", color: "bg-red-500", width: "25%" };
      case 2:
        return { label: "Medium", color: "bg-yellow-500", width: "50%" };
      case 3:
        return { label: "Strong", color: "bg-blue-500", width: "75%" };
      case 4:
        return { label: "Very Strong", color: "bg-green-500", width: "100%" };
      default:
        return { label: "Weak", color: "bg-red-500", width: "25%" };
    }
  };

  const getPasswordCriteria = (password: string) => [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "One uppercase letter", met: /[A-Z]/.test(password) },
    { label: "One number", met: /[0-9]/.test(password) },
    { label: "One special character", met: /[^A-Za-z0-9]/.test(password) },
  ];

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black z-40"
              onClick={handleClose}
            />

            {/* Slide-over panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              className="fixed top-0 right-0 h-full w-[460px] bg-white shadow-2xl z-50 flex flex-col"
            >
              <div className="relative flex-1 overflow-y-auto p-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold">{title}</h2>
                  <button
                    type="button"
                    onClick={resetFields}
                    className="text-gray-500 hover:text-gray-700"
                    title="Reset all fields"
                  >
                    <i className="bx bx-reset text-2xl" />
                  </button>
                </div>

                {/* Dynamic fields */}
                {fields.map((f, i) => {
                  const strength = f.showStrength ? getPasswordStrength(f.value) : null;
                  const criteria = f.showStrength ? getPasswordCriteria(f.value) : [];
                  return (
                    <div key={i} className="mb-4">
                      <input
                        type={f.type || "text"}
                        value={f.value}
                        placeholder={f.placeholder}
                        className="w-full border rounded-lg px-4 py-3"
                        onChange={(e) => f.onChange(e.target.value)}
                      />
                      {f.showStrength && (
                        <div className="mt-2 w-full">
                          {/* Strength bar */}
                          <div className="w-full h-3 rounded bg-gray-200 mb-1">
                            <div
                              className={`${strength.color} h-3 rounded`}
                              style={{ width: strength.width }}
                            />
                          </div>
                          <div className="text-sm font-medium mb-1">{strength.label}</div>

                          {/* Criteria list */}
                          <ul className="text-xs space-y-1">
                            {criteria.map((c, idx) => (
                              <li
                                key={idx}
                                className={`flex items-center ${
                                  c.met ? "text-green-600" : "text-gray-400"
                                }`}
                              >
                                <i
                                  className={`bx ${
                                    c.met ? "bx-check" : "bx-x"
                                  } mr-1`}
                                />
                                {c.label}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Custom actions */}
                {actions}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Confirm modal */}
      <ConfirmModal
        open={showConfirm}
        title="Discard Changes?"
        message="You have unsaved changes. Are you sure you want to close?"
        confirmLabel="Discard"
        destructive
        onClose={() => setShowConfirm(false)}
        onConfirm={() => {
          setShowConfirm(false);
          onClose();
          addToast({ type: "info", message: "Changes discarded" });
        }}
      />
    </>
  );
}