import PusherServer from "pusher";
import PusherClient from "pusher-js";

/**
 * SERVER-SIDE INSTANCE
 * Used in API routes to trigger forensic and security events.
 */
export const pusherServer = new PusherServer({
  appId: process.env.PUSHER_APP_ID as string,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY as string,
  secret: process.env.PUSHER_SECRET as string,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER as string,
  useTLS: true,
});

/**
 * CLIENT-SIDE SINGLETON
 * Prevents multiple socket connections during React re-renders.
 */
let pusherClientInstance: PusherClient | null = null;

export const getPusherClient = () => {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!key || !cluster) {
    throw new Error(
      "Pusher client keys missing. Check NEXT_PUBLIC_PUSHER_KEY and NEXT_PUBLIC_PUSHER_CLUSTER."
    );
  }

  if (!pusherClientInstance) {
    pusherClientInstance = new PusherClient(key, {
      cluster: cluster,
      forceTLS: true,
      // Enabled for private channel support (required for User/Org specific alerts)
      authEndpoint: "/api/pusher/auth", 
    });
  }

  return pusherClientInstance;
};