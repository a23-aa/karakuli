// Каракули — Edge Function «push»: рассылает Web Push. Вызывается только базой (заголовок x-push-secret).
// Ключи и секрет читаются из таблицы push_config (доступ с сайта к ней закрыт).
// Вставьте этот код в Supabase → Edge Functions → Deploy a new function (name: push) и выключите «Enforce JWT Verification».
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cfg } = await sb.from("push_config").select("key,value");
  const conf: Record<string, string> = Object.fromEntries((cfg ?? []).map((r: any) => [r.key, r.value]));
  if (!conf.secret || req.headers.get("x-push-secret") !== conf.secret) return new Response("forbidden", { status: 403 });
  if (!conf.vapid_public || !conf.vapid_private) return new Response("vapid keys are not set", { status: 500 });
  webpush.setVapidDetails(conf.vapid_subject || "https://example.com", conf.vapid_public, conf.vapid_private);

  const body = await req.json().catch(() => ({}));
  let q = sb.from("push_subscriptions").select("id,endpoint,p256dh,auth");
  if (body.user_id) q = q.eq("user_id", body.user_id);
  const { data: subs } = await q.limit(5000);
  const payload = JSON.stringify({ title: body.title || "Каракули", body: body.body || "", url: body.url || "index.html", tag: body.tag || null });
  const urgency = body.tag === "call" ? "high" : "normal", ttl = body.tag === "call" ? 45 : 3600;

  let sent = 0, dead = 0;
  const list = subs ?? [];
  for (let i = 0; i < list.length; i += 50) {
    await Promise.all(list.slice(i, i + 50).map(async (s: any) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: ttl, urgency });
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) { dead++; await sb.from("push_subscriptions").delete().eq("id", s.id); }
      }
    }));
  }
  return new Response(JSON.stringify({ sent, dead }), { headers: { "Content-Type": "application/json" } });
});
