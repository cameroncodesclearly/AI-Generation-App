-- Starter presets for the team. Covers can be generated from the preset editor.
INSERT OR IGNORE INTO presets (id, name, description, kind, model, template, negative, variables_json, params_json, category, visibility) VALUES
('pre_seed_product_hero', 'Golden Hour Product Hero', 'Editorial product shot with warm cinematic light. Add a reference image of the product for accuracy.', 'image', 'google/gemini-2.5-flash-image',
 'Editorial product photograph of {{product}} placed on {{surface}}. Golden hour sunlight raking from camera left, long soft shadows, gentle haze in the air, subtle lens flare. Shot on 85mm at f/2, shallow depth of field, background falls into a soft {{background}} gradient. Premium, minimal, Apple-style art direction. Fine film grain. No text, no logos other than on the product.',
 'text, watermark, extra objects, distorted labels, clutter',
 '[{"key":"product","label":"Product","type":"text","required":true,"help":"Describe it precisely: colour, material, size"},{"key":"surface","label":"Surface","type":"select","options":["wet slate","brushed concrete","white marble","sand dunes","black acrylic"],"default":"wet slate"},{"key":"background","label":"Background tone","type":"select","options":["sky blue to blush","deep navy","warm cream","charcoal"],"default":"sky blue to blush"}]',
 '{"aspect_ratio":"4:5"}', 'Products', 'team'),

('pre_seed_thumbnail', 'YouTube Thumbnail Face + Object', 'High-contrast thumbnail composition with a strong emotional read. Upload a reference photo of the person.', 'image', 'google/gemini-2.5-flash-image',
 'YouTube thumbnail, 16:9. {{subject}} on the left third with an exaggerated {{expression}} expression, looking toward {{object}} on the right third. Punchy complementary colour lighting (teal key, warm rim), crisp edge separation from a clean {{background}} background, slight vignette. Ultra sharp, high contrast, readable at small size. Leave the upper right empty for title text. No text.',
 'text, letters, watermark, blur, duplicate people',
 '[{"key":"subject","label":"Who","type":"text","required":true,"default":"a creator in their 30s"},{"key":"expression","label":"Expression","type":"select","options":["shocked","delighted","skeptical","focused","laughing"],"default":"shocked"},{"key":"object","label":"Object or scene","type":"text","required":true},{"key":"background","label":"Background","type":"select","options":["gradient","studio grey","blurred city","blurred office"],"default":"gradient"}]',
 '{"aspect_ratio":"16:9"}', 'Thumbnails', 'team'),

('pre_seed_cinema_title', 'Cinema Title Card', 'Glowing condensed title lettering over a dusk sky, in the Creative Creators house style.', 'image', 'google/gemini-3-pro-image-preview',
 'A classic cinema title card: the words "{{title}}" in bold condensed uppercase sans-serif lettering, glowing warm yellow with soft light bloom and faint light rays, slightly rotated, floating over a dusk sky gradient from deep blue at the top to pink-tinged clouds at the bottom. Analog film photography look, fine grain, soft focus edges, 1970s studio logo feeling. Centered composition, no other text.',
 'extra words, misspelling, watermark, modern UI elements',
 '[{"key":"title","label":"Title text","type":"text","required":true,"default":"CREATIVE CREATORS","help":"Keep it to 1-3 short words for accurate lettering"}]',
 '{"aspect_ratio":"16:9","resolution":"2K"}', 'Brand', 'team'),

('pre_seed_bts_vlog', 'POV Vlog Clip', 'Short handheld POV clip for Reels and TikTok. Add a first-frame image to anchor the location.', 'video', 'google/veo-3.1-fast',
 'Handheld POV vlog shot, vertical 9:16. {{action}} in {{location}}. Natural {{time_of_day}} light, slight camera shake, lens breathing as focus pulls. Ambient location sound, no music, no narration. Candid, warm, authentic documentary feeling.',
 NULL,
 '[{"key":"action","label":"What is happening","type":"textarea","required":true,"default":"walking through a doorway into a bright creative studio, waving at a colleague"},{"key":"location","label":"Location","type":"text","required":true,"default":"a converted warehouse studio"},{"key":"time_of_day","label":"Time of day","type":"select","options":["morning","midday","golden hour","blue hour"],"default":"golden hour"}]',
 '{"aspect_ratio":"9:16","duration":6,"resolution":"720p","generate_audio":true}', 'Social video', 'team'),

('pre_seed_hooks', '10 Hooks for a Short', 'Ten scroll-stopping opening lines for a 30 second vertical video.', 'text', 'anthropic/claude-sonnet-4.5',
 'Write 10 opening hooks (first 1-2 spoken lines) for a 30 second {{platform}} video about: {{topic}}.
Audience: {{audience}}.
Tone: {{tone}}.
Rules: each hook under 15 words, no questions that can be answered with "no", no "did you know", lead with a specific, concrete detail or a tension. Mix at least three patterns (contrarian, curiosity gap, result-first, story cold open, direct callout). Return a numbered list with a 4-word label for the pattern after each hook.',
 NULL,
 '[{"key":"platform","label":"Platform","type":"select","options":["TikTok","Instagram Reels","YouTube Shorts","LinkedIn"],"default":"TikTok"},{"key":"topic","label":"Topic","type":"textarea","required":true},{"key":"audience","label":"Audience","type":"text","default":"small business owners who want to grow on social"},{"key":"tone","label":"Tone","type":"select","options":["confident and direct","playful","calm expert","high energy"],"default":"confident and direct"}]',
 '{"max_tokens":900,"temperature":0.9,"system":"You are the head writer at a social-first video studio. You write hooks that real creators actually say out loud."}', 'Copy', 'team'),

('pre_seed_script', '30s Script From a Brief', 'A tight, shot-listed 30 second script with on-screen text and a CTA.', 'text', 'openai/gpt-5',
 'Write a 30 second vertical video script from this brief:
{{brief}}

Format as a table-like list of 6-8 beats. For each beat give: timecode range, spoken line (conversational, under 12 words), what we see (shot + action), on-screen text (max 5 words). End with a single CTA: {{cta}}. Brand voice: {{voice}}. No hashtags, no emojis.',
 NULL,
 '[{"key":"brief","label":"Brief","type":"textarea","required":true},{"key":"cta","label":"Call to action","type":"text","default":"Follow for more"},{"key":"voice","label":"Brand voice","type":"text","default":"warm, clear, a little cinematic"}]',
 '{"max_tokens":1200,"temperature":0.7}', 'Copy', 'team');
