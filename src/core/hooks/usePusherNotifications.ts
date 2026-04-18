// src/core/hooks/usePusherNotifications.ts
"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { getPusherClient } from "@/core/lib/pusher";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { useSWRConfig } from "swr";
import { NotificationType } from "@prisma/client";

export const usePusherNotifications = () => {
  const { data: session } = useSession();
  const { dispatch } = useAlerts();
  const { mutate } = useSWRConfig();
  const activeChannels = useRef<Set<string>>(new Set());

  const playNotificationSound = useCallback(() => {
    // Check if we are in the browser and user has interacted
    const audio = new Audio("/sounds/notification-chime.mp3");
    audio.volume = 0.4;
    audio.play().catch(() => {
      // Browsers often block auto-play until user interaction
      console.log("Audio playback delayed until interaction.");
    });
  }, []);

  const handleIncoming = useCallback((data: {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    approvalId?: string;
    activityId?: string;
  }) => {
    playNotificationSound();
    
    dispatch({
      // High-priority types stay on screen (PUSH), others disappear (TOAST)
      kind: (data.type === "SECURITY" || data.type === "APPROVAL") ? "PUSH" : "TOAST",
      notificationId: data.id,
      type: data.type,
      title: data.title,
      message: data.message,
      context: { 
        approvalId: data.approvalId, 
        activityId: data.activityId,
        // Tagging welcome notifications for special UI treatment
        isWelcome: data.title.toLowerCase().includes("welcome") 
      },
    });

    mutate("/api/notifications");
  }, [dispatch, mutate, playNotificationSound]);

  const userId = session?.user?.id;
  const orgId = session?.user?.organizationId;

  useEffect(() => {
    if (!userId || !orgId) return;

    const pusher = getPusherClient();
    const channelsToSubscribe = [`user-${userId}`, `org-${orgId}`];
    const currentSubs = activeChannels.current;

    channelsToSubscribe.forEach((name) => {
      if (!currentSubs.has(name)) {
        const channel = pusher.subscribe(name);
        channel.bind("notification:new", handleIncoming);
        channel.bind("notifications-read", () => mutate("/api/notifications"));
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