/**
 * Generates the studio's brand assets with OpenRouter (hero backdrop, preset covers, login art).
 * Usage:  OPENROUTER_API_KEY=... npm run assets:generate
 * Output: ./generated-assets/*.png  (upload the ones you like via Admin → Presets → Cover → Upload,
 *         or drop hero.png into public/ and reference it from styles.css)
 */
import { mkdirSync, writeFileSync } from "node:fs";

const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY) { console.error("Set OPENROUTER_API_KEY"); process.exit(1); }
const MODEL = process.env.IMAGE_MODEL ?? "google/gemini-2.5-flash-image";

const HOUSE = "Glassmorphic minimal Apple-style art direction mixed with classic 1970s cinema: dusk sky gradient from deep blue to pink-tinged clouds, warm yellow glowing light with soft bloom and faint light rays, analog film grain, soft focus edges, no text, no watermark.";

const jobs: { name: string; prompt: string; aspect: string }[] = [
  { name: "hero", prompt: `Wide cinematic backdrop. ${HOUSE} Empty sky with layered translucent clouds lit from below, a single horizontal band of warm light near the horizon.`, aspect: "21:9" },
  { name: "login", prompt: `Vertical poster backdrop. ${HOUSE} Light rays breaking through clouds, upper half calm blue, lower half warm.`, aspect: "9:16" },
  { name: "cover-product", prompt: `Square key art for a 'product photography' preset. A matte black bottle on wet slate lit by golden hour light. ${HOUSE}`, aspect: "1:1" },
  { name: "cover-thumbnail", prompt: `Square key art for a 'YouTube thumbnail' preset: a bright frame outline floating in a glowing sky, strong teal and warm complementary light. ${HOUSE}`, aspect: "1:1" },
  { name: "cover-title", prompt: `Square key art for a 'cinema title card' preset: abstract glowing yellow condensed letterforms, out of focus, over a dusk sky. ${HOUSE}`, aspect: "1:1" },
  { name: "cover-vlog", prompt: `Square key art for a 'POV vlog' preset: a handheld camera point of view walking into a sunlit warehouse studio. ${HOUSE}`, aspect: "1:1" },
  { name: "cover-copy", prompt: `Square key art for a 'copywriting' preset: a vintage typewriter page catching warm light, floating in sky. ${HOUSE}`, aspect: "1:1" },
];

mkdirSync("generated-assets", { recursive: true });
for (const j of jobs) {
  process.stdout.write(`${j.name}… `);
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: j.prompt }], modalities: ["image", "text"], image_config: { aspect_ratio: j.aspect } }),
  });
  if (!res.ok) { console.log(`failed ${res.status}: ${(await res.text()).slice(0, 200)}`); continue; }
  const data = (await res.json()) as { choices: { message: { images?: { image_url: { url: string } }[] } }[] };
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) { console.log("no image"); continue; }
  const m = /^data:(image\/\w+);base64,(.+)$/s.exec(url);
  if (!m) { console.log("unexpected image format"); continue; }
  const ext = m[1].split("/")[1] === "jpeg" ? "jpg" : m[1].split("/")[1];
  writeFileSync(`generated-assets/${j.name}.${ext}`, Buffer.from(m[2], "base64"));
  console.log(`saved generated-assets/${j.name}.${ext}`);
}
