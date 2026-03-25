import PusherServer from "pusher";
import PusherClient from "pusher-js";

// Server-side (No changes needed, but ensure ID and SECRET are in .env)
export const pusherServer = new PusherServer({
  appId: process.env.PUSHER_APP_ID as string,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY as string,
  secret: process.env.PUSHER_SECRET as string,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER as string,
  useTLS: true,
});

// Client-side: Add a check to prevent instantiating with undefined keys
export const getPusherClient = () => {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!key || !cluster) {
    throw new Error("Pusher client keys are missing. Ensure NEXT_PUBLIC_PUSHER_KEY and NEXT_PUBLIC_PUSHER_CLUSTER are set in your .env file.");
  }

  return new PusherClient(key, {
    cluster: cluster,
  });
};