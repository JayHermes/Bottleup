import { createClient } from "npm:@supabase/supabase-js@2.100.0";
import { normalizeNigerianPhone } from "../_shared/phone.mjs";

type Session = {
  phone: string;
  state: string;
  data: Record<string, unknown>;
  updated_at?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const clean = (value: unknown, max = 500) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const sendWhatsApp = async (to: string, payload: Record<string, unknown>) => {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) throw new Error("WhatsApp is not configured");

  const response = await fetch(
    "https://graph.facebook.com/v25.0/" + phoneNumberId + "/messages",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        ...payload,
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error("WhatsApp send failed: " + response.status + " " + error);
  }
};

const sendText = (to: string, body: string) =>
  sendWhatsApp(to, {
    type: "text",
    text: { preview_url: false, body },
  });

const sendMenu = (to: string) =>
  sendWhatsApp(to, {
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: "Bottle Up" },
      body: { text: "What would you like to do?" },
      footer: { text: "Recycle. Reward. Repeat." },
      action: {
        button: "Open menu",
        sections: [{
          title: "Bottle Up",
          rows: [
            { id: "pickup", title: "Schedule pickup", description: "Request a plastic pickup" },
            { id: "points", title: "My points", description: "Check your recycling balance" },
            { id: "rewards", title: "Rewards", description: "See rewards you can claim" },
            { id: "history", title: "My pickups", description: "See recent pickup requests" },
            { id: "help", title: "Help", description: "How Bottle Up works" },
          ],
        }],
      },
    },
  });

async function getSession(db: ReturnType<typeof createClient>, phone: string): Promise<Session> {
  const { data, error } = await db
    .from("whatsapp_sessions")
    .select("phone,state,data,updated_at")
    .eq("phone", phone)
    .maybeSingle();

  if (error) throw error;
  return data ?? { phone, state: "idle", data: {} };
}

async function setSession(
  db: ReturnType<typeof createClient>,
  phone: string,
  state: string,
  data: Record<string, unknown> = {},
) {
  const { error } = await db
    .from("whatsapp_sessions")
    .upsert(
      { phone, state, data, updated_at: new Date().toISOString() },
      { onConflict: "phone" },
    );
  if (error) throw error;
}

async function clearSession(db: ReturnType<typeof createClient>, phone: string) {
  await setSession(db, phone, "idle", {});
}

async function findProfile(db: ReturnType<typeof createClient>, phone: string) {
  const { data, error } = await db
    .from("profiles")
    .select("id,full_name,phone,city,points")
    .eq("phone", phone)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function createWhatsAppUser(
  db: ReturnType<typeof createClient>,
  phone: string,
  fullName: string,
  city: string,
) {
  const { data: existing } = await db.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  const existingUser = existing?.users?.find(
    (user) => normalizeNigerianPhone(user.phone ?? "") === phone,
  );

  let userId = existingUser?.id;

  if (!userId) {
    const { data, error } = await db.auth.admin.createUser({
      phone,
      phone_confirm: true,
      user_metadata: { full_name: fullName, city, source: "whatsapp" },
    });
    if (error) throw error;
    userId = data.user?.id;
  }

  if (!userId) throw new Error("Could not create Bottle Up account");

  const { error: profileError } = await db
    .from("profiles")
    .update({ full_name: fullName, phone, city })
    .eq("id", userId);

  if (profileError) throw profileError;
  return userId;
}

async function getPoints(db: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await db
    .from("profiles")
    .select("points")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return Number(data?.points ?? 0);
}

async function getRewards(db: ReturnType<typeof createClient>) {
  const { data, error } = await db
    .from("reward_catalog")
    .select("id,name,cost,note,active,kind,network,amount_naira")
    .eq("active", true)
    .order("cost", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

async function getPickupHistory(db: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await db
    .from("pickup_requests")
    .select("id,material_type,estimated_weight_kg,actual_weight_kg,pickup_location,status,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) throw error;
  return data ?? [];
}

async function createPickup(
  db: ReturnType<typeof createClient>,
  userId: string,
  data: Record<string, unknown>,
) {
  const estimatedWeight = Number(data.estimated_weight_kg);
  if (!Number.isFinite(estimatedWeight) || estimatedWeight < 0.01 || estimatedWeight > 20000) {
    throw new Error("Estimated weight must be between 0.01kg and 20,000kg");
  }

  const location = clean(data.pickup_location);
  if (!location) throw new Error("Pickup location is required");

  const { data: pickup, error } = await db
    .from("pickup_requests")
    .insert({
      user_id: userId,
      material_type: clean(data.material_type, 100) || "plastic bottles",
      estimated_weight_kg: estimatedWeight,
      pickup_location: location,
      latitude: typeof data.latitude === "number" ? data.latitude : null,
      longitude: typeof data.longitude === "number" ? data.longitude : null,
      status: "AVAILABLE",
    })
    .select("id,material_type,estimated_weight_kg,pickup_location,status")
    .single();

  if (error) throw error;
  return pickup;
}

function extractIncoming(payload: any) {
  const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return null;

  const from = normalizeNigerianPhone(message.from);
  if (!from) return null;

  if (message.type === "text") {
    return { from, type: "text", text: clean(message.text?.body, 1000) };
  }

  if (message.type === "interactive") {
    const id =
      message.interactive?.list_reply?.id ??
      message.interactive?.button_reply?.id;
    return { from, type: "interactive", text: clean(id, 100) };
  }

  if (message.type === "location") {
    return {
      from,
      type: "location",
      text: clean(message.location?.address || message.location?.name, 500),
      latitude: Number(message.location?.latitude),
      longitude: Number(message.location?.longitude),
    };
  }

  return { from, type: message.type, text: "" };
}

async function handleMessage(
  db: ReturnType<typeof createClient>,
  incoming: ReturnType<typeof extractIncoming>,
) {
  if (!incoming) return;

  const phone = incoming.from;
  const profile = await findProfile(db, phone);
  const session = await getSession(db, phone);
  const command = incoming.text.toLowerCase();

  if (!profile) {
    if (session.state === "awaiting_name") {
      const name = clean(incoming.text, 120);
      if (!name || name.length < 2) {
        await sendText(phone, "Please send your name so I can create your Bottle Up account.");
        return;
      }

      await setSession(db, phone, "awaiting_location", { name });
      await sendText(
        phone,
        "Thanks, " + name + ". Now send your location in WhatsApp so we know where you are based.",
      );
      return;
    }

    if (session.state === "awaiting_location") {
      if (
        incoming.type !== "location" ||
        !Number.isFinite(incoming.latitude) ||
        !Number.isFinite(incoming.longitude)
      ) {
        await sendText(phone, "Please send your location using WhatsApp's location option.");
        return;
      }

      const name = clean(session.data.name, 120);
      const city = clean(incoming.text, 200) || "Akwa Ibom";
      await createWhatsAppUser(db, phone, name, city);
      await clearSession(db, phone);
      await sendText(
        phone,
        "Account created, " + name + ". You can now use Bottle Up through WhatsApp.",
      );
      await sendMenu(phone);
      return;
    }

    await setSession(db, phone, "awaiting_name");
    await sendText(
      phone,
      "Welcome to Bottle Up. You can schedule plastic pickups, earn points and check rewards here.\n\nWhat should we call you?",
    );
    return;
  }

  if (session.state === "awaiting_pickup_weight") {
    const weight = Number(incoming.text.replace(/kg/i, "").trim());

    if (!Number.isFinite(weight) || weight <= 0) {
      await sendText(phone, "Send the estimated weight, for example: 3kg");
      return;
    }

    await setSession(db, phone, "awaiting_pickup_location", {
      estimated_weight_kg: weight,
      material_type: "plastic bottles",
    });

    await sendText(
      phone,
      "Where should we collect it from? Send the address/landmark, or share your WhatsApp location.",
    );
    return;
  }

  if (session.state === "awaiting_pickup_location") {
    const location =
      incoming.type === "location"
        ? incoming.text || "Shared WhatsApp location"
        : clean(incoming.text, 500);

    if (!location) {
      await sendText(phone, "Please send the pickup address/landmark or share your WhatsApp location.");
      return;
    }

    const pickupData = {
      ...session.data,
      pickup_location: location,
      latitude: incoming.type === "location" ? incoming.latitude : undefined,
      longitude: incoming.type === "location" ? incoming.longitude : undefined,
    };

    const pickup = await createPickup(db, profile.id, pickupData);
    await clearSession(db, phone);

    await sendText(
      phone,
      "Pickup request received.\n\n" +
        "ID: " + pickup.id.slice(0, 8) + "\n" +
        "Material: " + pickup.material_type + "\n" +
        "Estimated weight: " + pickup.estimated_weight_kg + "kg\n" +
        "Location: " + pickup.pickup_location + "\n" +
        "Status: AVAILABLE",
    );

    await sendMenu(phone);
    return;
  }

  if (["hi", "hello", "hey", "menu", "start", "restart"].includes(command)) {
    await clearSession(db, phone);

    if (["hi", "hello", "hey", "start", "restart"].includes(command)) {
      await sendText(phone, "Hi " + (profile.full_name || "there") + ".");
    }

    await sendMenu(phone);
    return;
  }

  switch (command) {
    case "pickup":
      await setSession(db, phone, "awaiting_pickup_weight");
      await sendText(
        phone,
        "How much plastic do you estimate is ready for collection? Send the weight in kg, for example: 2.5kg",
      );
      return;

    case "points": {
      const points = await getPoints(db, profile.id);
      await sendText(
        phone,
        "You currently have " +
          points.toLocaleString() +
          " Bottle Up points.\n\nPoints are credited after your collected weight is verified.",
      );
      await sendMenu(phone);
      return;
    }

    case "rewards": {
      const rewards = await getRewards(db);

      if (!rewards.length) {
        await sendText(phone, "There are no active rewards at the moment.");
      } else {
        const lines = rewards.slice(0, 10).map((reward: any) => {
          let line = "• " + reward.name + " — " + Number(reward.cost).toLocaleString() + " points";
          if (reward.note) line += "\n  " + reward.note;
          return line;
        });

        await sendText(phone, "Available rewards:\n\n" + lines.join("\n\n"));
      }

      await sendMenu(phone);
      return;
    }

    case "history": {
      const pickups = await getPickupHistory(db, profile.id);

      if (!pickups.length) {
        await sendText(phone, "You do not have any pickup requests yet.");
      } else {
        const lines = pickups.map((pickup: any) =>
          "• " +
          pickup.id.slice(0, 8) +
          " — " +
          pickup.status +
          " — " +
          pickup.estimated_weight_kg +
          "kg — " +
          pickup.pickup_location
        );

        await sendText(phone, "Your recent pickups:\n\n" + lines.join("\n"));
      }

      await sendMenu(phone);
      return;
    }

    case "help":
      await sendText(
        phone,
        "Bottle Up works like this:\n" +
          "1. Schedule a pickup.\n" +
          "2. A collector picks up and weighs the plastic.\n" +
          "3. Bottle Up verifies the weight.\n" +
          "4. You receive 100 points per verified kg.\n" +
          "5. You can use your points for available rewards.",
      );
      await sendMenu(phone);
      return;

    default:
      await sendText(phone, "I didn't understand that. Use the Bottle Up menu below.");
      await sendMenu(phone);
  }
}

async function verifySignature(req: Request, rawBody: string) {
  const secret = Deno.env.get("WHATSAPP_APP_SECRET");
  if (!secret) return true;

  const signature = req.headers.get("x-hub-signature-256");
  if (!signature?.startsWith("sha256=")) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );

  const expected = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

  return signature.slice(7) === expected;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (
        mode === "subscribe" &&
        token &&
        token === Deno.env.get("WHATSAPP_VERIFY_TOKEN")
      ) {
        return new Response(challenge ?? "", { status: 200 });
      }

      return json({ error: "Webhook verification failed" }, 403);
    }

    if (req.method !== "POST") return json({ error: "POST required" }, 405);

    const rawBody = await req.text();
    if (!(await verifySignature(req, rawBody))) {
      return json({ error: "Invalid signature" }, 401);
    }

    const payload = JSON.parse(rawBody);
    const incoming = extractIncoming(payload);
    if (!incoming) return json({ received: true });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Bottle Up backend is not configured" }, 503);
    }

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await handleMessage(db, incoming);
    return json({ received: true });
  } catch (error) {
    console.error(
      "whatsapp-bot:",
      error instanceof Error ? error.message : "Unexpected error",
    );
    return json({ error: "Webhook processing failed" }, 500);
  }
});
