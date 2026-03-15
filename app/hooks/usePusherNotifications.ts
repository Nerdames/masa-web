"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { getPusherClient } from "@/lib/pusher";
import { MASAAlert } from "@/types/alerts";
import { useAlerts } from "@/components/feedback/AlertProvider"; // Adjust path if needed

export const usePusherNotifications = () => {
  const { data: session } = useSession();
  const { dispatch } = useAlerts();

  useEffect(() => {
    if (!session?.user?.organizationId) return;

    const pusher = getPusherClient();
    const channel = pusher.subscribe(`org-${session.user.organizationId}`);

    channel.bind("critical-alert", (data: Omit<MASAAlert, "id" | "kind">) => {
      dispatch({
        kind: "PUSH",
        type: data.type,
        title: data.title,
        message: data.message,
        approvalId: data.approvalId,
        code: data.code,
        actionType: data.actionType,
      });
    });

    return () => {
      pusher.unsubscribe(`org-${session.user.organizationId}`);
      pusher.disconnect();
    };
  }, [session?.user?.organizationId, dispatch]);
};