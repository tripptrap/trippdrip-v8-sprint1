/**
 * extractFlowAnswers
 *
 * Given a lead's SMS reply and a list of required questions that still need
 * answers, asks GPT-4o-mini to extract any values it can confidently identify
 * from the message.  Returns a plain object keyed by fieldName.
 *
 * Example:
 *   message  = "I'm 34 and live in Texas with my wife and two kids"
 *   remaining = [
 *     { question: "How old are you?",        fieldName: "age" },
 *     { question: "What state do you live in?", fieldName: "state" },
 *     { question: "Household size?",          fieldName: "householdSize" },
 *   ]
 *   → { age: "34", state: "Texas", householdSize: "4" }
 */

import OpenAI from 'openai';

let _client: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

export interface RequiredQuestion {
  question: string;
  fieldName: string;
}

/**
 * Extract answers from a single message.
 * Returns {} if nothing can be extracted or on error (never throws).
 */
export async function extractFlowAnswers(
  message: string,
  remainingQuestions: RequiredQuestion[],
  alreadyCollected: Record<string, string> = {}
): Promise<Record<string, string>> {
  if (!message?.trim() || remainingQuestions.length === 0) return {};

  try {
    const openai = getOpenAI();

    const questionsJson = JSON.stringify(
      remainingQuestions.map(q => ({ fieldName: q.fieldName, question: q.question }))
    );

    const alreadyJson = Object.keys(alreadyCollected).length
      ? `\nAlready collected (do NOT re-extract): ${JSON.stringify(alreadyCollected)}`
      : '';

    const systemPrompt = `You are an answer-extraction assistant. Given a text message from a lead and a list of questions that still need answers, extract any values you can confidently identify.

Rules:
- Only extract values you are CONFIDENT about based on what the lead actually said
- Return a JSON object keyed by fieldName with string values
- If nothing can be extracted, return {}
- Do NOT guess or infer beyond what is stated
- Keep values concise (e.g. "34" not "The person is 34 years old")
- Numbers, dates, names, yes/no answers are all valid extractions
${alreadyJson}

Questions still needed:
${questionsJson}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      max_tokens: 200,
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return {};

    const parsed = JSON.parse(raw);

    // Only keep keys that correspond to remaining field names
    const validFieldNames = new Set(remainingQuestions.map(q => q.fieldName));
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (validFieldNames.has(key) && val && String(val).trim()) {
        result[key] = String(val).trim();
      }
    }

    return result;
  } catch (err) {
    console.error('extractFlowAnswers error (non-fatal):', err);
    return {};
  }
}
