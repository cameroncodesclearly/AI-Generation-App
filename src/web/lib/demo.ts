/**
 * Demo mode: a fully in-browser mock of the API so the UI can be explored without Cloudflare, OpenRouter or Resend.
 * Enabled by VITE_DEMO=1 at build time. Nothing here ships in the real build.
 */
import type { Analysis, Generation, Kind, ModelInfo, Preset, User } from "../../shared/types";

export const DEMO = import.meta.env.VITE_DEMO === "1";
export const demoFiles = new Map<string, string>(); // key -> data URL

const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString().replace("T", " ").slice(0, 19);
let seq = 100;
const id = (p: string) => `${p}_demo${(seq++).toString(36)}`;

// ---- Seeded team ---------------------------------------------------------
const users: (User & { generations?: number; analyses?: number; period_usd?: number })[] = [
  { id: "usr_cam", email: "cameron@clearskycreations.com", name: "Cameron", role: "admin", status: "active", credit_limit: 2000, credits_used: 212, period_start: "2026-10-01", period_reset: "monthly", created_at: ago(400), last_seen_at: now(), has_password: true, must_set_password: 0 },
  { id: "usr_edie", email: "edie@clearskycreations.com", name: "Edie", role: "member", status: "active", credit_limit: 800, credits_used: 455, period_start: "2026-10-01", period_reset: "monthly", created_at: ago(300), last_seen_at: ago(3), has_password: true, must_set_password: 0 },
  { id: "usr_marco", email: "marco@clearskycreations.com", name: "Marco", role: "member", status: "active", credit_limit: 500, credits_used: 60, period_start: "2026-10-01", period_reset: "monthly", created_at: ago(200), last_seen_at: ago(26), has_password: false, must_set_password: 0 },
];
let me = users[0];
let loggedIn = true;

const models: ModelInfo[] = [
  { id: "google/gemini-2.5-flash-image", name: "Nano Banana", kind: "image", featured: true, enabled: true, source: "openrouter", description: "Fast, excellent at editing and multi-reference consistency.", input_modalities: ["text", "image"], output_modalities: ["image"], pricing: { per_image: 0.039 }, options: { aspect_ratios: ["1:1", "16:9", "9:16", "4:3", "3:4", "4:5", "21:9"], supports_reference: true } },
  { id: "google/gemini-3-pro-image-preview", name: "Nano Banana Pro", kind: "image", featured: true, enabled: true, source: "openrouter", description: "Highest fidelity, great typography and 4K.", input_modalities: ["text", "image"], output_modalities: ["image"], pricing: { per_image: 0.134 }, options: { aspect_ratios: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"], resolutions: ["1K", "2K", "4K"], supports_reference: true } },
  { id: "openai/gpt-5-image", name: "GPT Image", kind: "image", enabled: true, source: "openrouter", description: "Strong prompt adherence.", input_modalities: ["text", "image"], output_modalities: ["image"], pricing: { per_image: 0.08 }, options: { aspect_ratios: ["1:1", "16:9", "9:16"], supports_reference: true } },
  { id: "black-forest-labs/flux.2-pro", name: "FLUX.2 Pro", kind: "image", enabled: true, source: "openrouter", description: "Photoreal, cinematic lighting.", input_modalities: ["text", "image"], output_modalities: ["image"], pricing: { per_image: 0.05 }, options: { aspect_ratios: ["1:1", "16:9", "9:16", "4:3", "3:4"], supports_reference: true } },
  { id: "bytedance/seedance-2.0", name: "Seedance 2.0", kind: "video", featured: true, enabled: true, source: "openrouter", description: "Great value, strong character consistency.", input_modalities: ["text", "image"], output_modalities: ["video"], pricing: { per_second: 0.08 }, options: { aspect_ratios: ["16:9", "9:16", "1:1"], resolutions: ["480p", "720p", "1080p"], durations: [5, 10], supports_reference: true, supports_audio: true } },
  { id: "google/veo-3.1", name: "Veo 3.1", kind: "video", featured: true, enabled: true, source: "openrouter", description: "Cinematic, native audio.", input_modalities: ["text", "image"], output_modalities: ["video"], pricing: { per_second: 0.4 }, options: { aspect_ratios: ["16:9", "9:16"], resolutions: ["720p", "1080p"], durations: [4, 6, 8], supports_reference: true, supports_audio: true } },
  { id: "openai/sora-2", name: "Sora 2", kind: "video", enabled: true, source: "openrouter", description: "Strong physics and motion.", input_modalities: ["text", "image"], output_modalities: ["video"], pricing: { per_second: 0.1 }, options: { aspect_ratios: ["16:9", "9:16"], resolutions: ["720p"], durations: [4, 8, 12], supports_reference: true, supports_audio: true } },
  { id: "kwaivgi/kling-v3.0-pro", name: "Kling 3.0 Pro", kind: "video", enabled: true, source: "openrouter", input_modalities: ["text", "image"], output_modalities: ["video"], pricing: { per_second: 0.1 }, options: { aspect_ratios: ["16:9", "9:16", "1:1"], resolutions: ["720p", "1080p"], durations: [5, 10], supports_reference: true } },
  { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5", kind: "text", featured: true, enabled: true, source: "openrouter", input_modalities: ["text", "image"], output_modalities: ["text"], pricing: { prompt: 3e-6, completion: 15e-6 } },
  { id: "openai/gpt-5", name: "GPT-5", kind: "text", featured: true, enabled: true, source: "openrouter", input_modalities: ["text", "image"], output_modalities: ["text"], pricing: { prompt: 1.25e-6, completion: 10e-6 } },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", kind: "text", enabled: true, source: "openrouter", input_modalities: ["text", "image", "video"], output_modalities: ["text"], pricing: { prompt: 0.3e-6, completion: 2.5e-6 } },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash (video)", kind: "analyze", featured: true, enabled: true, source: "openrouter", description: "Cheapest full video + audio understanding.", input_modalities: ["text", "video", "audio"], output_modalities: ["text"], pricing: { prompt: 0.3e-6, completion: 2.5e-6 } },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro (video)", kind: "analyze", enabled: true, source: "openrouter", input_modalities: ["text", "video", "audio"], output_modalities: ["text"], pricing: { prompt: 1.25e-6, completion: 10e-6 } },
];

// ---- Canvas "renders" -----------------------------------------------------
const PALETTES: [string, string, string][] = [["#0f1b2a", "#1a5276", "#85c1e9"], ["#1a1307", "#3a2f14", "#d9b435"], ["#101418", "#2b3a4a", "#85c1e9"], ["#1a5276", "#0d1b2b", "#f7dc6f"], ["#23272b", "#0c0e11", "#85c1e9"], ["#2c1f1a", "#5a3a2a", "#f7dc6f"], ["#0b2a3a", "#1a5276", "#f1f2f4"], ["#121416", "#33261a", "#d9b435"]];
function ratio(ar: string | undefined): [number, number] {
  const m = /^(\d+):(\d+)$/.exec(ar ?? ""); if (!m) return [1, 1]; return [Number(m[1]), Number(m[2])];
}
export function render(prompt: string, ar = "1:1", seed = 0, label = ""): string {
  const [w, h] = ratio(ar); const W = 768; const H = Math.round((768 * h) / w);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  const [a, b, d] = PALETTES[Math.abs(seed) % PALETTES.length];
  const g = ctx.createLinearGradient(0, 0, W * 0.3, H); g.addColorStop(0, a); g.addColorStop(1, b); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const r = ctx.createRadialGradient(W * 0.7, H * 0.35, 10, W * 0.7, H * 0.35, W * 0.6); r.addColorStop(0, d + "cc"); r.addColorStop(1, d + "00"); ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 14; i++) { ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1 + (i % 3); ctx.beginPath(); ctx.moveTo(((seed * 37 + i * 97) % W), 0); ctx.lineTo(((seed * 53 + i * 131) % W), H); ctx.stroke(); }
  ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, H - 110, W, 110);
  ctx.fillStyle = "#fff"; ctx.font = "600 22px Poppins, sans-serif"; ctx.textBaseline = "top";
  const words = prompt.split(/\s+/); let line = ""; let y = H - 96; const lines: string[] = [];
  for (const wd of words) { const t = line ? `${line} ${wd}` : wd; if (ctx.measureText(t).width > W - 48) { lines.push(line); line = wd; } else line = t; if (lines.length === 2) break; }
  if (lines.length < 2) lines.push(line);
  for (const l of lines.slice(0, 2)) { ctx.fillText(l, 24, y); y += 30; }
  ctx.fillStyle = "#f7dc6f"; ctx.font = "700 12px Poppins, sans-serif"; ctx.fillText((label || "DEMO RENDER").toUpperCase(), 24, H - 28);
  return c.toDataURL("image/jpeg", 0.85);
}
function putFile(key: string, dataUrl: string): string { demoFiles.set(key, dataUrl); return key; }

// ---- Seeded presets ------------------------------------------------------
const presets: (Preset & { author_name?: string })[] = [
  { id: "pre_seed_product_hero", name: "Golden Hour Product Hero", description: "Editorial product shot with warm cinematic light. Add a reference image of the product for accuracy.", kind: "image", model: "google/gemini-2.5-flash-image", template: "Editorial product photograph of {{product}} placed on {{surface}}. Golden hour sunlight raking from camera left, long soft shadows, gentle haze, subtle lens flare. Shot on 85mm at f/2, shallow depth of field, background falls into a soft {{background}} gradient. Premium, minimal, Apple-style art direction. Fine film grain. No text.", negative: "text, watermark, extra objects, distorted labels, clutter", variables_json: JSON.stringify([{ key: "product", label: "Product", type: "text", required: true, help: "Describe it precisely: colour, material, size" }, { key: "surface", label: "Surface", type: "select", options: ["wet slate", "brushed concrete", "white marble", "sand dunes", "black acrylic"], default: "wet slate" }, { key: "background", label: "Background tone", type: "select", options: ["sky blue to blush", "deep navy", "warm cream", "charcoal"], default: "sky blue to blush" }]), params_json: JSON.stringify({ aspect_ratio: "4:5" }), reference_keys_json: "[]", cover_key: null, category: "Products", visibility: "team", created_by: "usr_cam", runs: 42, created_at: ago(300), updated_at: ago(20), author_name: "Cameron" },
  { id: "pre_seed_thumbnail", name: "YouTube Thumbnail Face + Object", description: "High-contrast thumbnail composition with a strong emotional read. Upload a reference photo of the person.", kind: "image", model: "google/gemini-2.5-flash-image", template: "YouTube thumbnail, 16:9. {{subject}} on the left third with an exaggerated {{expression}} expression, looking toward {{object}} on the right third. Punchy complementary colour lighting, crisp edge separation from a clean {{background}} background. Ultra sharp, high contrast, readable at small size. Leave the upper right empty for title text. No text.", negative: "text, letters, watermark, blur", variables_json: JSON.stringify([{ key: "subject", label: "Who", type: "text", required: true, default: "a creator in their 30s" }, { key: "expression", label: "Expression", type: "select", options: ["shocked", "delighted", "skeptical", "focused", "laughing"], default: "shocked" }, { key: "object", label: "Object or scene", type: "text", required: true }, { key: "background", label: "Background", type: "select", options: ["gradient", "studio grey", "blurred city", "blurred office"], default: "gradient" }]), params_json: JSON.stringify({ aspect_ratio: "16:9" }), reference_keys_json: "[]", cover_key: null, category: "Thumbnails", visibility: "team", created_by: "usr_edie", runs: 31, created_at: ago(280), updated_at: ago(40), author_name: "Edie" },
  { id: "pre_seed_cinema_title", name: "Cinema Title Card", description: "Glowing condensed title lettering over a dusk sky, in the Creative Creators house style.", kind: "image", model: "google/gemini-3-pro-image-preview", template: "A classic cinema title card: the words \"{{title}}\" in bold condensed uppercase sans-serif lettering, glowing warm yellow with soft light bloom and faint light rays, floating over a dusk sky gradient from deep blue to pink-tinged clouds. Analog film look, fine grain. Centered composition, no other text.", negative: "extra words, misspelling, watermark", variables_json: JSON.stringify([{ key: "title", label: "Title text", type: "text", required: true, default: "CREATIVE CREATORS", help: "Keep it to 1-3 short words" }]), params_json: JSON.stringify({ aspect_ratio: "16:9", resolution: "2K" }), reference_keys_json: "[]", cover_key: null, category: "Brand", visibility: "team", created_by: "usr_cam", runs: 18, created_at: ago(260), updated_at: ago(60), author_name: "Cameron" },
  { id: "pre_seed_bts_vlog", name: "POV Vlog Clip", description: "Short handheld POV clip for Reels and TikTok. Add a first-frame image to anchor the location.", kind: "video", model: "google/veo-3.1-fast", template: "Handheld POV vlog shot, vertical 9:16. {{action}} in {{location}}. Natural {{time_of_day}} light, slight camera shake, lens breathing. Ambient location sound, no music. Candid, warm, documentary feeling.", negative: null, variables_json: JSON.stringify([{ key: "action", label: "What is happening", type: "textarea", required: true, default: "walking through a doorway into a bright creative studio, waving at a colleague" }, { key: "location", label: "Location", type: "text", required: true, default: "a converted warehouse studio" }, { key: "time_of_day", label: "Time of day", type: "select", options: ["morning", "midday", "golden hour", "blue hour"], default: "golden hour" }]), params_json: JSON.stringify({ aspect_ratio: "9:16", duration: 6, resolution: "720p", generate_audio: true }), reference_keys_json: "[]", cover_key: null, category: "Social video", visibility: "team", created_by: "usr_marco", runs: 9, created_at: ago(200), updated_at: ago(80), author_name: "Marco" },
  { id: "pre_seed_hooks", name: "10 Hooks for a Short", description: "Ten scroll-stopping opening lines for a 30 second vertical video.", kind: "text", model: "anthropic/claude-sonnet-4.5", template: "Write 10 opening hooks for a 30 second {{platform}} video about: {{topic}}.\nAudience: {{audience}}. Tone: {{tone}}.\nRules: each hook under 15 words, no questions answerable with \"no\", no \"did you know\". Mix at least three patterns. Numbered list with a 4-word pattern label after each.", negative: null, variables_json: JSON.stringify([{ key: "platform", label: "Platform", type: "select", options: ["TikTok", "Instagram Reels", "YouTube Shorts", "LinkedIn"], default: "TikTok" }, { key: "topic", label: "Topic", type: "textarea", required: true }, { key: "audience", label: "Audience", type: "text", default: "small business owners who want to grow on social" }, { key: "tone", label: "Tone", type: "select", options: ["confident and direct", "playful", "calm expert", "high energy"], default: "confident and direct" }]), params_json: JSON.stringify({ max_tokens: 900, temperature: 0.9 }), reference_keys_json: "[]", cover_key: null, category: "Copy", visibility: "team", created_by: "usr_edie", runs: 57, created_at: ago(250), updated_at: ago(10), author_name: "Edie" },
  { id: "pre_seed_script", name: "30s Script From a Brief", description: "A tight, shot-listed 30 second script with on-screen text and a CTA.", kind: "text", model: "openai/gpt-5", template: "Write a 30 second vertical video script from this brief:\n{{brief}}\n\n6-8 beats: timecode, spoken line (under 12 words), what we see, on-screen text (max 5 words). End with the CTA: {{cta}}. Brand voice: {{voice}}.", negative: null, variables_json: JSON.stringify([{ key: "brief", label: "Brief", type: "textarea", required: true }, { key: "cta", label: "Call to action", type: "text", default: "Follow for more" }, { key: "voice", label: "Brand voice", type: "text", default: "warm, clear, a little cinematic" }]), params_json: JSON.stringify({ max_tokens: 1200, temperature: 0.7 }), reference_keys_json: "[]", cover_key: null, category: "Copy", visibility: "team", created_by: "usr_cam", runs: 22, created_at: ago(240), updated_at: ago(30), author_name: "Cameron" },
];
presets.forEach((p, i) => { p.cover_key = putFile(`covers/${p.id}.jpg`, render(p.name, "1:1", i + 2, p.category)); });

// ---- Seeded generations --------------------------------------------------
const SAMPLE_TEXT = `1. "Nobody tells you this about cold brew." — contrarian cold open
2. "I made 300 cups wrong before this." — result-first confession
3. "The café down the street charges $7 for this." — price tension
4. "Three ingredients. Twelve hours. Zero bitterness." — specific numbers
5. "Stop stirring. Seriously." — direct callout
6. "This is the ratio baristas won't post." — curiosity gap
7. "Day 1 of making cold brew like a pro." — story cold open
8. "Your grind size is sabotaging you." — problem diagnosis
9. "The $3 tool that changed my mornings." — object hook
10. "Watch the colour change at hour nine." — visual promise`;
type Gen = Generation & { user_email?: string; user_name?: string };
const gens: Gen[] = [];
const seedGen = (o: Partial<Gen> & { kind: Kind; prompt: string; user: User; hours: number; ar?: string; preset_id?: string | null; favorite?: number; fail?: string }) => {
  const g: Gen = { id: id("gen"), user_id: o.user.id, kind: o.kind, model: o.model ?? (o.kind === "image" ? "google/gemini-2.5-flash-image" : o.kind === "video" ? "bytedance/seedance-2.0" : "anthropic/claude-sonnet-4.5"), prompt: o.prompt, params_json: JSON.stringify(o.kind === "video" ? { aspect_ratio: o.ar ?? "16:9", duration: 5, resolution: "720p", generate_audio: true, count: 1 } : o.kind === "image" ? { aspect_ratio: o.ar ?? "1:1", count: 1 } : { max_tokens: 900, temperature: 0.9, count: 1 }), input_keys_json: "[]", preset_id: o.preset_id ?? null, status: o.fail ? "failed" : "done", provider_job_id: null, estimate_credits: o.kind === "video" ? 46 : o.kind === "image" ? 5 : 2, actual_credits: o.fail ? null : o.kind === "video" ? 44 : o.kind === "image" ? 4 : 1, cost_usd: o.fail ? null : o.kind === "video" ? 0.38 : o.kind === "image" ? 0.039 : 0.006, outputs_json: "[]", text_output: o.kind === "text" && !o.fail ? SAMPLE_TEXT : null, error: o.fail ?? null, favorite: o.favorite ?? 0, created_at: ago(o.hours), completed_at: ago(o.hours), user_email: o.user.email, user_name: o.user.name ?? undefined };
  if (o.kind !== "text" && !o.fail) { const key = putFile(`outputs/${g.id}/0.jpg`, render(o.prompt, o.ar ?? (o.kind === "video" ? "16:9" : "1:1"), seq, o.kind === "video" ? "demo video frame" : "demo render")); g.outputs_json = JSON.stringify([{ key, mime: "image/jpeg" }]); }
  gens.push(g); return g;
};
const P = [
  ["Editorial product photograph of a matte black insulated bottle on wet slate, golden hour, 85mm f/2, soft haze", "4:5", "pre_seed_product_hero", 1],
  ["Cinema title card: the words CREATIVE CREATORS in glowing condensed lettering over a dusk sky", "16:9", "pre_seed_cinema_title", 0],
  ["YouTube thumbnail: a creator in their 30s, shocked, looking at a giant espresso machine, gradient background", "16:9", "pre_seed_thumbnail", 0],
  ["Minimal poster for a rooftop screening, warm film grain, deep blue sky, mustard typography", "3:4", null, 1],
  ["Close-up of a ceramic mug with latte art, window light, shallow depth of field, Kinfolk mood", "1:1", null, 0],
  ["Streetwear lookbook frame, overcast daylight, concrete wall, slight motion blur", "4:5", null, 0],
  ["Overhead flat lay of camera gear on linen, warm morning light", "1:1", null, 0],
  ["Neon sign that reads OPEN LATE reflected in rain puddle, cyan and amber", "9:16", null, 1],
] as const;
P.forEach(([p, ar, pid, fav], i) => seedGen({ kind: "image", prompt: p, user: users[i % 3], hours: 2 + i * 5, ar, preset_id: pid, favorite: fav }));
seedGen({ kind: "video", prompt: "Slow dolly-in on a chrome espresso machine at golden hour, steam catching the light, ambient café sound", user: users[0], hours: 6, ar: "16:9" });
seedGen({ kind: "video", prompt: "Handheld POV walking into a bright warehouse studio, waving at a colleague, golden hour", user: users[2], hours: 30, ar: "9:16", preset_id: "pre_seed_bts_vlog" });
seedGen({ kind: "video", prompt: "Macro of cold brew dripping into a glass, backlit, 120fps feel", user: users[1], hours: 50, ar: "1:1", model: "google/veo-3.1" });
seedGen({ kind: "text", prompt: "Write 10 opening hooks for a 30 second TikTok video about: cold brew at home. Audience: small business owners.", user: users[1], hours: 4, preset_id: "pre_seed_hooks" });
seedGen({ kind: "text", prompt: "Write 10 opening hooks for a 30 second Instagram Reels video about: our new studio space.", user: users[0], hours: 28 });
seedGen({ kind: "image", prompt: "Product shot with impossible reflections", user: users[2], hours: 9, fail: "Model returned no image (content was flagged by the provider)" });

// ---- Seeded analyses -----------------------------------------------------
const analyses: Analysis[] = [];
const batches: { id: string; user_id: string; name: string; total: number; created_at: string }[] = [{ id: "bat_demo1", user_id: "usr_cam", name: "Competitor hooks, Oct", total: 3, created_at: ago(20) }];
const mkAnalysis = (src: string, note: string, hours: number, batch: string | null, status: Analysis["status"] = "done"): Analysis => ({
  id: id("ana"), user_id: "usr_cam", batch_id: batch, source_url: src, file_key: null, filename: null, note, model: "google/gemini-2.5-flash", status,
  transcript: status === "done" ? "[00:00] Okay so nobody tells you this about cold brew.\n[00:03] I made like three hundred cups wrong before I figured this out.\n[00:08] It's the ratio. One to eight. Not one to four like every blog says.\n[00:14] Coarse grind, twelve hours, room temperature. Not the fridge.\n[00:21] Watch the colour change around hour nine, that's when it's ready.\n[00:27] Save this for the weekend." : null,
  summary: status === "done" ? "A creator debunks common cold brew advice in a fast talking-head format with cutaway inserts. The hook is a contrarian claim delivered in the first second, followed by a credibility beat (300 failed cups), then three concrete, numbered tips. Pacing is tight: a cut every 2 to 3 seconds, on-screen text mirrors each tip, and the video ends with a save prompt rather than a follow ask. It works because every line is specific and the viewer gets a complete recipe without leaving." : null,
  visual: status === "done" ? "[00:00] Medium close-up, talking head, kitchen background, natural window light from the left. Bold white caption at chest height.\n[00:03] Jump cut, slightly tighter. Hand gesture for emphasis.\n[00:08] Cutaway: overhead shot of a mason jar, grounds being poured. Text overlay: 1:8.\n[00:14] Cutaway: grinder close-up, coarse grounds in palm. Text overlay: COARSE · 12H.\n[00:21] Timelapse of the jar darkening on a counter. Text overlay: HOUR 9.\n[00:27] Back to talking head, pointing down at the caption. End card with a Save icon." : null,
  extras_json: JSON.stringify(status === "done" ? { on_screen_text: "nobody tells you this · 1:8 · COARSE · 12H · HOUR 9 · SAVE THIS", hook: "Contrarian claim in the first second (\"nobody tells you this\") plus an immediate credibility beat (\"300 cups wrong\"). The viewer wants to know what everyone gets wrong.", format: "talking head with cutaways", key_moments: ["[00:00] contrarian hook", "[00:08] the ratio reveal", "[00:21] timelapse payoff", "[00:27] save prompt"], caption_ideas: ["The cold brew ratio every blog gets wrong. Save this.", "300 bad cups so you don't have to. 1:8, coarse, 12 hours.", "Hour nine is when the magic happens ☕"], hashtags: ["coldbrew", "coffeetok", "homebarista", "coffeerecipe", "morningroutine"], note_response: "The hook works because it is contrarian and specific at the same time. The credibility beat right after it is what keeps people past second three.", duration_seconds: 31 } : {}),
  estimate_credits: 2, actual_credits: status === "done" ? 2 : null, cost_usd: status === "done" ? 0.012 : null, error: status === "failed" ? "This link can't be fetched directly. Upload the file or connect the NAS analyzer bridge." : null, created_at: ago(hours), completed_at: status === "done" ? ago(hours) : null,
});
analyses.push(mkAnalysis("https://www.tiktok.com/@homebarista/video/7421", "Why does this hook work?", 5, null));
analyses.push(mkAnalysis("https://youtu.be/dQw4w9WgXcQ", "Pull the editing rhythm", 9, null));
analyses.push(mkAnalysis("https://www.tiktok.com/@competitor/video/1", "hooks", 20, "bat_demo1"));
analyses.push(mkAnalysis("https://www.tiktok.com/@competitor/video/2", "hooks", 20, "bat_demo1"));
analyses.push(mkAnalysis("https://www.instagram.com/reel/abc", "hooks", 20, "bat_demo1", "failed"));

const ledger: { id: string; user_id: string; delta: number; reason: string; ref_type: string; ref_id: string; created_at: string; email?: string }[] = [];
for (const g of gens) { ledger.push({ id: id("led"), user_id: g.user_id, delta: g.estimate_credits, reason: "reserve", ref_type: "generation", ref_id: g.id, created_at: g.created_at, email: g.user_email }); if (g.status === "done" && g.actual_credits !== null) ledger.push({ id: id("led"), user_id: g.user_id, delta: g.actual_credits - g.estimate_credits, reason: "settle", ref_type: "generation", ref_id: g.id, created_at: g.created_at, email: g.user_email }); else if (g.status === "failed") ledger.push({ id: id("led"), user_id: g.user_id, delta: -g.estimate_credits, reason: "refund", ref_type: "generation", ref_id: g.id, created_at: g.created_at, email: g.user_email }); }

// ---- Estimation (mirrors the worker) -------------------------------------
const CREDIT_USD = 0.01, MARKUP = 1.15;
const credits = (usd: number) => Math.max(1, Math.ceil((usd * MARKUP) / CREDIT_USD));
function estimate(b: { kind: Kind; model: string; prompt?: string; params?: Record<string, unknown>; count?: number; reference_keys?: string[] }) {
  const m = models.find((x) => x.id === b.model && x.kind === b.kind) ?? models[0];
  const n = Math.max(1, Number(b.count ?? 1)); const p = b.params ?? {}; let usd = 0; const breakdown: string[] = [];
  if (b.kind === "image") { const per = m.pricing.per_image ?? 0.05; const mult = p.resolution === "4K" ? 2 : p.resolution === "2K" ? 1.5 : 1; usd = per * mult * n; breakdown.push(`${n} image${n > 1 ? "s" : ""} × $${(per * mult).toFixed(3)}`); }
  else if (b.kind === "video") { const per = m.pricing.per_second ?? 0.2; const s = Number(p.duration ?? 5); const mult = p.resolution === "1080p" ? 1.5 : p.resolution === "480p" ? 0.7 : 1; usd = per * s * mult * n; breakdown.push(`${s}s × $${per.toFixed(3)}/s${mult !== 1 ? ` × ${mult} (${p.resolution})` : ""}`); }
  else { const inTok = Math.ceil((b.prompt ?? "").length / 3.6) + 128; const out = Number(p.max_tokens ?? 1500); usd = (inTok * (m.pricing.prompt ?? 1e-6) + out * (m.pricing.completion ?? 5e-6)) * n; breakdown.push(`≈${inTok} in + up to ${out} out tokens`); }
  return { credits: credits(usd), usd, breakdown };
}

// ---- Job simulation ------------------------------------------------------
function simulate(g: Gen) {
  const params = JSON.parse(g.params_json) as Record<string, unknown>;
  const count = Number(params.count ?? 1);
  setTimeout(() => { g.status = "running"; }, 800);
  setTimeout(() => {
    const outs: { key: string; mime: string }[] = [];
    if (g.kind !== "text") for (let i = 0; i < count; i++) outs.push({ key: putFile(`outputs/${g.id}/${i}.jpg`, render(g.prompt, String(params.aspect_ratio ?? (g.kind === "video" ? "16:9" : "1:1")), seq + i, g.kind === "video" ? "demo video frame" : "demo render")), mime: "image/jpeg" });
    g.outputs_json = JSON.stringify(outs);
    if (g.kind === "text") g.text_output = `Demo output for: "${g.prompt.slice(0, 80)}"\n\n${SAMPLE_TEXT}`;
    g.status = "done"; g.completed_at = now(); g.actual_credits = Math.max(1, g.estimate_credits - 1); g.cost_usd = (g.actual_credits / 1.15) * CREDIT_USD;
    const u = users.find((x) => x.id === g.user_id)!; u.credits_used -= 1;
    ledger.unshift({ id: id("led"), user_id: g.user_id, delta: -1, reason: "settle", ref_type: "generation", ref_id: g.id, created_at: now(), email: u.email });
  }, g.kind === "video" ? 9000 : g.kind === "image" ? 4000 : 2500);
}

// ---- Router ----------------------------------------------------------------
type Res = { status?: number; body?: unknown; text?: string; type?: string };
const json = (body: unknown, status = 200): Res => ({ status, body });
const err = (status: number, error: string): Res => ({ status, body: { error } });
const pub = (u: User) => { const { ...rest } = u; return rest; };

async function route(method: string, url: URL, init?: RequestInit): Promise<Res> {
  const p = url.pathname; const q = url.searchParams;
  const body = async () => { try { return JSON.parse(String(init?.body ?? "{}")); } catch { return {}; } };
  if (p === "/api/health") return json({ ok: true, demo: true });
  if (p === "/api/auth/providers") return json({ google: true, email: true });
  if (p === "/api/auth/request" || p === "/api/auth/login" || p === "/api/auth/google") { loggedIn = true; return json({ ok: true, demo: true, message: "Demo mode: you're signed in as Cameron.", must_set_password: false }); }
  if (p === "/api/auth/logout") { loggedIn = false; return json({ ok: true }); }
  if (!loggedIn) return err(401, "Sign in required");
  if (p === "/api/auth/me") { if (method === "PATCH") { me.name = (await body()).name || me.name; return json({ ok: true }); } return json({ user: pub(me), remaining: Math.max(0, me.credit_limit - me.credits_used), config: { app_name: "Creative Creators Studio (demo)", credit_usd: CREDIT_USD, markup: MARKUP, nas_bridge: true, openrouter: true, email: true, google: true } }); }
  if (p === "/api/auth/password") return json({ ok: true });
  if (p === "/api/auth/ledger") return json({ entries: ledger.filter((l) => l.user_id === me.id).slice(0, 100) });
  if (p === "/api/models") { const k = q.get("kind"); return json({ models: k ? models.filter((m) => m.kind === k) : models }); }
  if (p === "/api/models/estimate") return json(estimate(await body()));
  if (p === "/api/models/estimate-analysis") { const b = await body(); const n = Math.max(1, b.count ?? 1); return json({ credits: 2 * n, usd: 0.0118 * n, breakdown: ["≈60s of video (18,600 tokens in, 2,500 out)"], warning: "Duration unknown; assuming 60s until processed." }); }
  if (p === "/api/upload") { const fd = init?.body as FormData; const f = fd.get("file") as File; const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); }); const key = putFile(`uploads/${me.id}/${id("up")}.${(f.name.split(".").pop() || "png")}`, f.type.startsWith("image/") ? dataUrl : render(f.name, "16:9", seq, "uploaded video")); return json({ key, url: key, filename: f.name, size: f.size, mime: f.type }); }
  if (p === "/api/generate" && method === "POST") {
    const b = await body(); const est = estimate(b); const remaining = me.credit_limit - me.credits_used;
    if (est.credits > remaining) return { status: 402, body: { error: `Not enough credits: this needs ${est.credits}, you have ${remaining} left this period.` } };
    me.credits_used += est.credits;
    const g: Gen = { id: id("gen"), user_id: me.id, kind: b.kind, model: b.model, prompt: b.prompt, params_json: JSON.stringify({ ...(b.params ?? {}), count: b.count ?? 1, ...(b.negative ? { negative: b.negative } : {}) }), input_keys_json: JSON.stringify(b.reference_keys ?? []), preset_id: b.preset_id ?? null, status: "queued", provider_job_id: null, estimate_credits: est.credits, actual_credits: null, cost_usd: null, outputs_json: "[]", text_output: null, error: null, favorite: 0, created_at: now(), completed_at: null, user_email: me.email, user_name: me.name ?? undefined };
    gens.unshift(g); ledger.unshift({ id: id("led"), user_id: me.id, delta: est.credits, reason: "reserve", ref_type: "generation", ref_id: g.id, created_at: now(), email: me.email });
    if (b.preset_id) { const pr = presets.find((x) => x.id === b.preset_id); if (pr) pr.runs++; }
    simulate(g); return json({ generation: g }, 201);
  }
  let m: RegExpExecArray | null;
  if (p === "/api/generations") {
    let list = gens.filter((g) => (q.get("scope") === "team" || g.user_id === me.id) && (!q.get("kind") || g.kind === q.get("kind")) && (!q.get("status") || g.status === q.get("status")) && (q.get("favorite") !== "1" || g.favorite) && (!q.get("preset_id") || g.preset_id === q.get("preset_id")));
    const ids = q.get("ids"); if (ids) list = list.filter((g) => ids.split(",").includes(g.id));
    const s = (q.get("q") ?? "").toLowerCase(); if (s) list = list.filter((g) => g.prompt.toLowerCase().includes(s));
    return json({ generations: list.slice(0, Number(q.get("limit") ?? 40)) });
  }
  if ((m = /^\/api\/generations\/([^/]+)(?:\/(rerun|favorite))?$/.exec(p))) {
    const g = gens.find((x) => x.id === m![1]); if (!g) return err(404, "Not found");
    if (m[2] === "favorite") { g.favorite = g.favorite ? 0 : 1; return json({ favorite: !!g.favorite }); }
    if (m[2] === "rerun") { const pr = JSON.parse(g.params_json); const { count, negative, ...rest } = pr; return route("POST", new URL("/api/generate", url.origin), { method: "POST", body: JSON.stringify({ kind: g.kind, model: g.model, prompt: g.prompt, negative, params: rest, count: count ?? 1, reference_keys: JSON.parse(g.input_keys_json), preset_id: g.preset_id }) }); }
    if (method === "DELETE") { gens.splice(gens.indexOf(g), 1); return json({ ok: true }); }
    return json({ generation: g });
  }
  if (p === "/api/presets") {
    if (method === "POST") { const b = await body(); const pr: Preset & { author_name?: string } = { id: id("pre"), name: b.name, description: b.description ?? null, kind: b.kind, model: b.model, template: b.template, negative: b.negative ?? null, variables_json: JSON.stringify(b.variables ?? []), params_json: JSON.stringify(b.params ?? {}), reference_keys_json: JSON.stringify(b.reference_keys ?? []), cover_key: b.cover_key ?? null, category: b.category || "General", visibility: b.visibility === "private" ? "private" : "team", created_by: me.id, runs: 0, created_at: now(), updated_at: now(), author_name: me.name ?? undefined }; presets.unshift(pr); return json({ preset: pr }, 201); }
    return json({ presets: presets.filter((x) => x.visibility === "team" || x.created_by === me.id) });
  }
  if ((m = /^\/api\/presets\/([^/]+)(?:\/(preview|run|cover))?$/.exec(p))) {
    const pr = presets.find((x) => x.id === m![1]); if (!pr) return err(404, "Preset not found");
    if (m[2] === "preview") { const v = (await body()).variables ?? {}; return json({ prompt: pr.template.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_: string, k: string) => v[k] ?? ""), params: JSON.parse(pr.params_json), missing: [] }); }
    if (m[2] === "cover") { pr.cover_key = putFile(`covers/${pr.id}-${seq}.jpg`, render(pr.name, "1:1", seq, pr.category)); const g: Gen = { ...gens[0], id: id("gen"), status: "done", outputs_json: JSON.stringify([{ key: pr.cover_key, mime: "image/jpeg" }]) }; return json({ generation: g }, 201); }
    if (method === "PUT") { const b = await body(); Object.assign(pr, { name: b.name ?? pr.name, description: b.description ?? pr.description, kind: b.kind ?? pr.kind, model: b.model ?? pr.model, template: b.template ?? pr.template, negative: b.negative ?? pr.negative, variables_json: b.variables ? JSON.stringify(b.variables) : pr.variables_json, params_json: b.params ? JSON.stringify(b.params) : pr.params_json, reference_keys_json: b.reference_keys ? JSON.stringify(b.reference_keys) : pr.reference_keys_json, cover_key: b.cover_key !== undefined ? b.cover_key : pr.cover_key, category: b.category ?? pr.category, visibility: b.visibility ?? pr.visibility, updated_at: now() }); return json({ preset: pr }); }
    if (method === "DELETE") { presets.splice(presets.indexOf(pr), 1); return json({ ok: true }); }
    return json({ preset: pr });
  }
  if (p === "/api/analyses" && method === "POST") { const b = await body(); me.credits_used += 2; const a = mkAnalysis(b.source_url ?? b.filename ?? "upload", b.note ?? "", 0, null, "queued"); a.filename = b.filename ?? null; a.user_id = me.id; analyses.unshift(a); setTimeout(() => { a.status = "running"; }, 800); setTimeout(() => { Object.assign(a, mkAnalysis(a.source_url!, a.note ?? "", 0, null, "done"), { id: a.id, filename: a.filename }); }, 5000); return json({ analysis: a }, 201); }
  if (p === "/api/analyses/batch") { const fd = init?.body; let n = 3; let name = "Batch"; if (fd instanceof FormData) { name = String(fd.get("name") || "CSV batch"); n = Math.max(1, (String(await (fd.get("file") as File).text()).trim().split("\n").length - 1)); } else { const b = await body(); name = b.name ?? name; n = (b.rows ?? []).length; } const bid = id("bat"); batches.unshift({ id: bid, user_id: me.id, name, total: n, created_at: now() }); for (let i = 0; i < n; i++) { const a = mkAnalysis(`https://www.tiktok.com/@brand/video/${1000 + i}`, "", 0, bid, "queued"); a.user_id = me.id; analyses.unshift(a); setTimeout(() => { Object.assign(a, mkAnalysis(a.source_url!, "", 0, bid, "done"), { id: a.id }); }, 3000 + i * 1500); } me.credits_used += 2 * n; return json({ batch_id: bid, created: n, errors: [] }, 201); }
  if (p === "/api/analyses") { const b = q.get("batch_id"); return json({ analyses: b ? analyses.filter((a) => a.batch_id === b) : analyses.filter((a) => !a.batch_id) }); }
  if (p === "/api/analyses/batches") return json({ batches: batches.map((b) => ({ ...b, done: analyses.filter((a) => a.batch_id === b.id && a.status === "done").length, failed: analyses.filter((a) => a.batch_id === b.id && a.status === "failed").length })) });
  if ((m = /^\/api\/analyses\/batches\/([^/]+)\/export\.csv$/.exec(p))) { const rows = analyses.filter((a) => a.batch_id === m![1]); const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`; return { status: 200, type: "text/csv", text: ["id,status,source,note,summary,transcript,visual_description", ...rows.map((a) => [a.id, a.status, a.source_url, a.note, a.summary, a.transcript, a.visual].map(esc).join(","))].join("\n") }; }
  if ((m = /^\/api\/analyses\/([^/]+)(?:\/(retry))?$/.exec(p))) { const a = analyses.find((x) => x.id === m![1]); if (!a) return err(404, "Not found"); if (m[2] === "retry") { a.status = "queued"; a.error = null; setTimeout(() => { Object.assign(a, mkAnalysis(a.source_url!, a.note ?? "", 0, a.batch_id, "done"), { id: a.id }); }, 4000); return json({ ok: true }); } if (method === "DELETE") { analyses.splice(analyses.indexOf(a), 1); return json({ ok: true }); } return json({ analysis: a }); }
  if (p === "/api/admin/users") { if (method === "POST") { const b = await body(); const u: User = { id: id("usr"), email: b.email, name: b.name || null, role: b.role === "admin" ? "admin" : "member", status: "active", credit_limit: Number(b.credit_limit ?? 2000), credits_used: 0, period_start: "2026-10-01", period_reset: "monthly", created_at: now(), last_seen_at: null, has_password: !!b.password, must_set_password: b.password ? 1 : 0 }; users.push(u); return json({ user: u, invited: !b.password }, 201); } return json({ users: users.map((u) => ({ ...u, generations: gens.filter((g) => g.user_id === u.id).length, analyses: analyses.filter((a) => a.user_id === u.id).length, period_usd: gens.filter((g) => g.user_id === u.id).reduce((s, g) => s + (g.cost_usd ?? 0), 0) })) }); }
  if ((m = /^\/api\/admin\/users\/([^/]+)(?:\/(reset|adjust|invite|password))?$/.exec(p))) { const u = users.find((x) => x.id === m![1]); if (!u) return err(404, "User not found"); if (m[2] === "reset") { u.credits_used = 0; return json({ ok: true }); } if (m[2] === "adjust") { u.credits_used = Math.max(0, u.credits_used + Number((await body()).delta)); return json({ ok: true }); } if (m[2] === "invite") return json({ ok: true, sent: true }); if (m[2] === "password") { u.has_password = true; u.must_set_password = 1; return json({ ok: true }); } if (method === "PATCH") { const b = await body(); Object.assign(u, { name: b.name ?? u.name, credit_limit: b.credit_limit ?? u.credit_limit, role: b.role ?? u.role, status: b.status ?? u.status, period_reset: b.period_reset ?? u.period_reset }); return json({ user: u }); } if (method === "DELETE") { users.splice(users.indexOf(u), 1); return json({ ok: true }); } return json({ user: u }); }
  if (p === "/api/admin/usage") return json({ byUser: users.map((u) => ({ id: u.id, email: u.email, name: u.name, credit_limit: u.credit_limit, credits_used: u.credits_used, period_start: u.period_start, period_credits: u.credits_used })), byModel: Object.values(gens.filter((g) => g.status === "done").reduce((acc, g) => { const k = g.model + g.kind; acc[k] = acc[k] ?? { model: g.model, kind: g.kind, runs: 0, credits: 0, usd: 0 }; acc[k].runs++; acc[k].credits += g.actual_credits ?? 0; acc[k].usd += g.cost_usd ?? 0; return acc; }, {} as Record<string, { model: string; kind: string; runs: number; credits: number; usd: number }>)), recent: ledger.slice(0, 60), totals: { month_usd: gens.reduce((s, g) => s + (g.cost_usd ?? 0), 0) + analyses.reduce((s, a) => s + (a.cost_usd ?? 0), 0), month_generations: gens.length, month_analyses: analyses.length, in_flight: gens.filter((g) => g.status === "queued" || g.status === "running").length } });
  if (p === "/api/admin/models") return json({ models });
  if (p.startsWith("/api/admin/models/")) { const mid = decodeURIComponent(p.slice("/api/admin/models/".length)); const b = await body(); for (const x of models) if (x.id === mid && (!b.kind || x.kind === b.kind)) { if (b.enabled !== undefined) x.enabled = b.enabled; if (b.featured !== undefined) x.featured = b.featured; if (b.label) x.name = b.label; if (b.price_override) { x.pricing = { ...x.pricing, ...b.price_override }; x.source = "override"; } } return json({ ok: true }); }
  if (p === "/api/admin/ledger") return json({ entries: ledger.slice(0, 200) });
  return err(404, `Demo: no mock for ${method} ${p}`);
}

export function installDemo() {
  if (!DEMO) return;
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
    if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/files/")) return real(input, init);
    if (url.pathname.startsWith("/files/")) { const key = decodeURIComponent(url.pathname.slice(7)); const d = demoFiles.get(key); return d ? real(d) : new Response("Not found", { status: 404 }); }
    await new Promise((r) => setTimeout(r, 120 + Math.random() * 200));
    const res = await route((init?.method ?? "GET").toUpperCase(), url, init);
    if (res.text !== undefined) return new Response(res.text, { status: res.status ?? 200, headers: { "Content-Type": res.type ?? "text/plain" } });
    return new Response(JSON.stringify(res.body ?? {}), { status: res.status ?? 200, headers: { "Content-Type": "application/json" } });
  };
}
