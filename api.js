import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { setDebugRaw, hideInitialLoader, switchView } from './ui.js';

const DEBUG_BYPASS_AI = false;
const LLM_API_KEY = "AIzaSyA58TjdqTNxnBrIEIoP_Xwp-cgbMqvTZz4";

const firebaseConfig = {
    apiKey: "AIzaSyD81oPn5HUBGmkHWId2KVpPdbGvJ9St_og",
    authDomain: "shortstudio-59078.firebaseapp.com",
    projectId: "shortstudio-59078",
    storageBucket: "shortstudio-59078.firebasestorage.app",
    messagingSenderId: "366522463743",
    appId: "1:366522463743:web:c782685bf99baf24aaa3ca",
    measurementId: "G-G6X5PXXP2S"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

function safeParseJsonArray(maybeJson) {
    if (Array.isArray(maybeJson)) return maybeJson;
    let s = String(maybeJson || '').trim();
    s = s.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const m = s.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('JSON配列が見つかりません');
    return JSON.parse(m[0]);
}

export async function callLLM(prompt, schema = null) {
    if (DEBUG_BYPASS_AI) {
        const sample = JSON.stringify([
            { title: "サンプル: 要点整理", point: "PFCを意識", detail: "たんぱく質/脂質/炭水化物のバランス", code: "" },
            { title: "サンプル: 睡眠のコツ", point: "就寝1時間前は画面オフ", detail: "入眠を妨げる要因を減らす", code: "" }
        ]);
        setDebugRaw("DEBUG_BYPASS_AI\n" + sample);
        return sample;
    }

    const models = [
        "gemini-2.5-flash-preview-05-20",
        "gemini-1.5-flash"
    ];

    const payloadBase = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
    if (schema) payloadBase.generationConfig = { responseMimeType: "application/json", responseSchema: schema };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
        let lastErr;
        for (const model of models) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${LLM_API_KEY}`;
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payloadBase),
                    signal: controller.signal
                });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();
                return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            } catch (e) {
                lastErr = e;
            }
        }
        throw lastErr || new Error('LLM呼び出しに失敗しました');
    } finally {
        clearTimeout(timeout);
    }
}

export async function generateCardsFromAI(count, topic = '全般') {
    const prompt =
        `あなたは専門家です。モバイル学習アプリ向けに、トピック「${topic}」の学習カードを${count}個、` +
        `JSON配列で生成してください。各要素は { "title": "...", "point": "...", "detail": "...", "code": "..." } を含めること。`;
    const schema = {
        type: "ARRAY",
        items: {
            type: "OBJECT",
            properties: {
                title: { type: "STRING" }, point: { type: "STRING" }, detail: { type: "STRING" }, code: { type: "STRING" }
            },
            required: ["title", "point"]
        }
    };

    let resultText;
    try {
        resultText = await callLLM(prompt, schema);
    } catch (err) {
        console.error(err);
        throw err;
    }
    setDebugRaw('RAW:\n' + String(resultText).slice(0, 5000));

    let arr;
    try {
        arr = safeParseJsonArray(resultText);
    } catch (parseErr) {
        console.error(parseErr);
        throw parseErr;
    }

    const now = Date.now();
    return arr.map((raw, i) => {
        const title = String(raw.title || raw.heading || `学習カード ${i + 1}`).slice(0, 120);
        const point = String(raw.point || raw.summary || '要点').slice(0, 200);
        const detail = raw.detail ? String(raw.detail) : '';
        const code = raw.code ? String(raw.code) : '';
        return { id: `${topic}-${now}-${i}`, title, point, detail, code };
    });
}

export function createFallbackCards(topic) {
    const now = Date.now();
    return [
        { id: `${topic}-${now}-f1`, title: `フォールバック: ${topic} 1`, point: '生成失敗のため暫定', detail: '', code: '' },
        { id: `${topic}-${now}-f2`, title: `フォールバック: ${topic} 2`, point: '生成失敗のため暫定', detail: '', code: '' }
    ];
}

export function setupFirebase() {
    return new Promise(resolve => {
        onAuthStateChanged(auth, () => {
            if (document.getElementById('initial-loader').style.display !== 'none') {
                hideInitialLoader();
                switchView('search');
            }
            resolve();
        });
        signInAnonymously(auth).catch(() => {
            hideInitialLoader();
            switchView('search');
            resolve();
        });
    });
}
