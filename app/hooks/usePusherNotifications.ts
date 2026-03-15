"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { getPusherClient } from "@/lib/pusher";
import { useAlerts } from "@/components/feedback/AlertProvider";
import { useSWRConfig } from "swr";

/* -------------------------------------------------- */
/* TYPES */
/* -------------------------------------------------- */

type NotificationType =
  | "SECURITY"
  | "SYSTEM"
  | "SUCCESS"
  | "WARNING"
  | "INFO"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_DECISION";

interface IncomingNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;

  approvalId?: string | null;
  branchId?: string | null;

  createdAt?: string;

  silent?: boolean;
}

/* -------------------------------------------------- */
/* HOOK */
/* -------------------------------------------------- */

export const usePusherNotifications = () => {
  const { data: session } = useSession();
  const { dispatch } = useAlerts();
  const { mutate } = useSWRConfig();

  const subscribedChannelRef = useRef<string | null>(null);
  const seenNotificationsRef = useRef<Set<string>>(new Set());
  const revalidateTimeout = useRef<NodeJS.Timeout | null>(null);

  /* -------------------------------------------------- */
  /* THROTTLED REVALIDATION */
  /* -------------------------------------------------- */

  const revalidateNotifications = useCallback(() => {
    if (revalidateTimeout.current) return;

    revalidateTimeout.current = setTimeout(() => {
      mutate("/api/notifications");
      revalidateTimeout.current = null;
    }, 1000); // throttle bursts
  }, [mutate]);

  /* -------------------------------------------------- */
  /* HANDLE INCOMING EVENT */
  /* -------------------------------------------------- */

  const handleIncoming = useCallback(
    (data: IncomingNotification) => {
      if (!data?.id) return;

      /* Prevent duplicates */
      if (seenNotificationsRef.current.has(data.id)) return;
      seenNotificationsRef.current.add(data.id);

      /* Dispatch alert */
      try {
        if (!data.silent) {
          dispatch({
            kind: "PUSH",
            type: data.type || "INFO",
            title: data.title,
            message: data.message,
            approvalId: data.approvalId ?? undefined,
          });
        }
      } catch (err) {
        console.error(
          "[usePusherNotifications][DISPATCH_ERROR]",
          err
        );
      }

      /* Refresh notifications list */
      revalidateNotifications();
    },
    [dispatch, revalidateNotifications]
  );

  /* -------------------------------------------------- */
  /* SUBSCRIBE TO PUSHER */
  /* -------------------------------------------------- */

  useEffect(() => {
    const orgId = session?.user?.organizationId;
    if (!orgId) return;

    const channelName = `org-${orgId}`;

    if (subscribedChannelRef.current === channelName) return;

    let pusher: ReturnType<typeof getPusherClient> | null = null;
    let channel: any = null;

    try {
      pusher = getPusherClient();
      channel = pusher.subscribe(channelName);

      subscribedChannelRef.current = channelName;
    } catch (err) {
      console.error(
        "[usePusherNotifications][SUBSCRIBE_ERROR]",
        err
      );
      return;
    }

    /* -------------------------------------------------- */
    /* CONNECTION EVENTS */
    /* -------------------------------------------------- */

    try {
      pusher.connection.bind("connected", () => {
        console.debug(
          "[Pusher] Connected to notifications channel"
        );
      });

      pusher.connection.bind("error", (err: any) => {
        console.error("[Pusher] Connection error", err);
      });
    } catch (err) {
      console.error(
        "[usePusherNotifications][CONNECTION_BIND_ERROR]",
        err
      );
    }

    /* -------------------------------------------------- */
    /* NOTIFICATION EVENTS */
    /* -------------------------------------------------- */

    try {
      channel.bind("notification:new", handleIncoming);

      /* Backwards compatibility */
      channel.bind("new-notification", handleIncoming);
      channel.bind("critical-alert", handleIncoming);
    } catch (err) {
      console.error("[usePusherNotifications][BIND_ERROR]", err);
    }

    /* -------------------------------------------------- */
    /* CLEANUP */
    /* -------------------------------------------------- */

    return () => {
      try {
        if (channel) {
          channel.unbind("notification:new", handleIncoming);
          channel.unbind("new-notification", handleIncoming);
          channel.unbind("critical-alert", handleIncoming);
        }

        if (pusher) {
          pusher.unsubscribe(channelName);
        }
      } catch (err) {
        console.error(
          "[usePusherNotifications][CLEANUP_ERROR]",
          err
        );
      } finally {
        subscribedChannelRef.current = null;
      }
    };
  }, [session?.user?.organizationId, handleIncoming]);
};