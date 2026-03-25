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
  
  // Use a Set to track active subscriptions
  const activeChannels = useRef<Set<string>>(new Set());

  const playNotificationSound = useCallback(() => {
    const audio = new Audio("/sounds/notification-chime.mp3");
    audio.volume = 0.4;
    audio.play().catch(() => {});
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
      kind: (data.type === "SECURITY" || data.type === "APPROVAL") ? "PUSH" : "TOAST",
      type: data.type,
      title: data.title,
      message: data.message,
      approvalId: data.approvalId,
      activityId: data.activityId,
    });

    mutate("/api/notifications");
  }, [dispatch, mutate, playNotificationSound]);

  // Extract variables to avoid optional chaining in the dependency array
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
  }, [userId, orgId, handleIncoming, mutate]); // Clean dependency array
};