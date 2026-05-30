"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { getPusherClient } from "@/infrastructure/pusher/client";
import { useAlerts } from "@/shared/components/feedback/AlertProvider";
import { useSWRConfig } from "swr";
import { NotificationType, Resource } from "@prisma/client";
import { usePermission } from "@/shared/hooks/usePermission";

/**
 * TYPE DEFINITIONS FOR ENTERPRISE PAYLOADS
 */
interface PusherAlertPayload {
  id: string;
  kind: "PUSH" | "TOAST";
  type: NotificationType;
  title: string;
  message: string;
  actionTrigger?: string | null;
  approvalId?: string | null;
  activityId?: string | null;
  createdAt: number;
}

/**
 * PRODUCTION-READY PUSHER HOOK
 * Synchronizes real-time notifications with the core RBAC engine and SWR cache.
 */
export const usePusherNotifications = () => {
  const { data: session } = useSession();
  const { dispatch } = useAlerts();
  const { mutate } = useSWRConfig();
  const { canSee } = usePermission();
  
  const activeChannels = useRef<Set<string>>(new Set());

  // 1. REQUEST SYSTEM PERMISSION FOR NATIVE CHIME
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
      }
    }
  }, []);

  const triggerSystemNotification = useCallback((title: string, message: string) => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(title, {
          body: message,
          icon: "/logo.png",
          silent: false, // Triggers default OS chime
        });
      } catch (error) {
        console.warn("[SYSTEM] Native notification failed:", error);
      }
    }
  }, []);

  const handleIncoming = useCallback((data: PusherAlertPayload) => {
    // 2. CLEARANCE CHECK
    if (data.type === "SECURITY" && !canSee(Resource.AUDIT)) {
      return; 
    }

    // 3. AUDITORY & SYSTEM FEEDBACK
    triggerSystemNotification(data.title, data.message);
    
    // 4. UI DISPATCH
    dispatch({
      kind: data.kind,
      notificationId: data.id,
      type: data.type,
      title: data.title,
      message: data.message,
      context: { 
        approvalId: data.approvalId || undefined, 
        activityId: data.activityId || undefined,
        isWelcome: data.title.toLowerCase().includes("welcome"),
        isCritical: data.type === "SECURITY" || data.type === "APPROVAL"
      },
    });

    // 5. CACHE SYNCHRONIZATION
    mutate("/api/notifications");
    
    // Type-safe key check for forensic audit synchronization
    if (data.activityId || data.type === "SECURITY") {
      mutate((key: unknown) => typeof key === 'string' && key.startsWith("/api/audit"));
    }
  }, [dispatch, mutate, triggerSystemNotification, canSee]);

  const userId = session?.user?.id;
  const orgId = session?.user?.organizationId;

  // 6. DYNAMIC SUBSCRIPTION MANAGEMENT
  useEffect(() => {
    if (!userId || !orgId) return;

    const pusher = getPusherClient();
    const channelsToSubscribe = [`user-${userId}`, `org-${orgId}`];
    const currentSubs = activeChannels.current;

    channelsToSubscribe.forEach((name) => {
      if (!currentSubs.has(name)) {
        const channel = pusher.subscribe(name);
        
        // Listener for new alerts
        channel.bind("new-alert", handleIncoming);
        
        // FIX: Removed unused 'readData' parameter to resolve ESLint error
        channel.bind("notifications-read", () => {
          mutate("/api/notifications");
        });

        currentSubs.add(name);
      }
    });

    return () => {
      channelsToSubscribe.forEach((name) => {
        const channel = pusher.channel(name);
        if (channel) {
          channel.unbind_all();
          pusher.unsubscribe(name);
        }
        currentSubs.delete(name);
      });
    };
  }, [userId, orgId, handleIncoming, mutate]);
};