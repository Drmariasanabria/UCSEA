// OPTIONAL server-side AI for NPC stations (Claude), deployed as a Firebase Cloud Function.
// The Anthropic API key lives in Secret Manager and never reaches the browser.
// Deploy:  firebase functions:secrets:set ANTHROPIC_API_KEY  &&  firebase deploy --only functions
// Then paste the function URL into the teacher console → IA → "URL de la función".
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import Anthropic from '@anthropic-ai/sdk';

initializeApp();
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const MODEL = 'claude-opus-5-5';

export const npcReply = onRequest(
  { secrets: [ANTHROPIC_API_KEY], cors: true, region: 'europe-west1', timeoutSeconds: 60, maxInstances: 10 },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('POST only'); return; }
    // Only signed-in users of this Firebase project may use the key.
    const token = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    try {
      await getAuth().verifyIdToken(token);
    } catch {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    const { system, messages } = req.body || {};
    if (typeof system !== 'string' || !Array.isArray(messages) || !messages.length) {
      res.status(400).json({ error: 'bad request' });
      return;
    }
    const clean = messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    try {
      const msg = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 2048,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default', // re-run a declined request on Anthropic's recommended fallback model
        output_config: { effort: 'low' }, // short in-character radio replies
        system: system.slice(0, 12000),
        messages: clean,
      });
      if (msg.stop_reason === 'refusal') {
        res.status(200).json({ text: 'Say again your message. Over.', model: msg.model, refused: true });
        return;
      }
      const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
      res.status(200).json({ text, model: msg.model });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) res.status(429).json({ error: 'rate_limited' });
      else if (e instanceof Anthropic.APIError) res.status(502).json({ error: 'upstream', status: e.status });
      else res.status(500).json({ error: 'internal' });
    }
  },
);
