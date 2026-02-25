/**
 * CodeMaster – Learn C# & .NET
 * Frontend-only learning application
 * Uses JSON + localStorage, Gemini API for quiz generation & evaluation
 */

// =============================================
// STATE
// =============================================
let appData = null;
let currentSubject = null;
let currentTopicId = null;
let generatedMcqs = [];
let generatedPractical = [];

// Gemini API configuration (replace with your key)
const GEMINI_API_KEY = "AIzaSyC-ykl_KUThHaIotSeKv3bu0As5V1kpqDE"; // TODO: your Gemini API key
const GEMINI_MODEL = "gemini-2.5-flash";

async function callGemini(prompt) {
    if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key missing. Set GEMINI_API_KEY in script.js.");
    }

    const url =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        GEMINI_MODEL +
        ":generateContent?key=" +
        encodeURIComponent(GEMINI_API_KEY);

    const body = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.5,
            topP: 0.95,
            maxOutputTokens: 200000
        },
    };

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const txt = await res.text();
        throw new Error("Gemini API error: " + (txt || res.statusText));
    }

    const data = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!reply) {
        console.error("Gemini raw response:", data);
        throw new Error("Gemini did not return any content. Check API key, billing, and model access.");
    }
    return reply;
}

// =============================================
// DOM ELEMENTS
// =============================================
const hero = document.getElementById('hero');
const subjectView = document.getElementById('subjectView');
const topicList = document.getElementById('topicList');
const contentInner = document.getElementById('contentInner');
const backBtn = document.getElementById('backBtn');
const headerSubtitle = document.getElementById('headerSubtitle');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.getElementById('sidebar');
const resultModal = document.getElementById('resultModal');
const closeResultBtn = document.getElementById('closeResultBtn');

// =============================================
// INITIALIZATION
// =============================================
document.addEventListener('DOMContentLoaded', init);

async function init() {
    await loadData();
    bindEvents();
}

/**
 * Load data from JSON file
 */
async function loadData() {
    try {
        const res = await fetch('data.json');
        appData = await res.json();
    } catch (err) {
        console.error('Failed to load data.json:', err);
    }
}

/**
 * Bind all event listeners
 */
function bindEvents() {
    document.querySelectorAll('.subject-btn').forEach(btn => {
        btn.addEventListener('click', () => selectSubject(btn.dataset.subject));
    });

    backBtn.addEventListener('click', goHome);
    sidebarToggle.addEventListener('click', toggleSidebar);
    closeResultBtn.addEventListener('click', () => {
        resultModal.style.display = 'none';
    });

    resultModal.addEventListener('click', (e) => {
        if (e.target === resultModal) resultModal.style.display = 'none';
    });
}

// =============================================
// NAVIGATION
// =============================================

function selectSubject(subjectId) {
    currentSubject = subjectId;
    const subject = appData.subjects[subjectId];
    if (!subject) return;

    headerSubtitle.textContent = subject.name;
    backBtn.style.display = 'block';
    hero.style.display = 'none';
    subjectView.style.display = 'flex';

    buildSidebar(subject.topics);
    if (subject.topics.length) {
        loadTopic(subject.topics[0].id);
    }
}

function goHome() {
    currentSubject = null;
    currentTopicId = null;
    backBtn.style.display = 'none';
    headerSubtitle.textContent = '';
    hero.style.display = 'flex';
    subjectView.style.display = 'none';
}

function toggleSidebar() {
    sidebar.classList.toggle('open');
}

function buildSidebar(topics) {
    topicList.innerHTML = topics.map(t => `
        <a href="#" class="topic-link" data-topic="${t.id}">${escapeHtml(t.title)}</a>
    `).join('');

    topicList.querySelectorAll('.topic-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            loadTopic(link.dataset.topic);
            if (window.innerWidth <= 768) sidebar.classList.remove('open');
        });
    });
}

// =============================================
// TOPIC CONTENT
// =============================================

function loadTopic(topicId) {
    currentTopicId = topicId;
    const subject = appData.subjects[currentSubject];
    const topic = subject.topics.find(t => t.id === topicId);
    if (!topic) return;

    topicList.querySelectorAll('.topic-link').forEach(link => {
        link.classList.toggle('active', link.dataset.topic === topicId);
    });

    const html = `
        <div class="topic-header">
            <h2>${escapeHtml(topic.title)}</h2>
        </div>

        <div class="section">
            <h3 class="section-title">Definition & Syntax</h3>
            <p>${escapeHtml(topic.definition)}</p>
            <div class="code-block">
                <pre>${escapeHtml(topic.syntax)}</pre>
            </div>
        </div>

        <div class="section">
            <h3 class="section-title">Practical Example</h3>
            <div class="code-block">
                <pre>${escapeHtml(topic.example.code)}</pre>
            </div>
            <div class="output-block">
                <div class="output-label">Output</div>
                <pre>${escapeHtml(topic.example.output)}</pre>
            </div>
        </div>

        <div class="section quiz-section">
            <h3 class="section-title">AI Generated Quiz & Practical</h3>
            <p>Click "Start Quiz" to generate 10 MCQs and 10 practical questions using AI based on this topic.</p>
            <button class="quiz-btn" id="startQuizBtn">Start Quiz</button>
            <div class="quiz-container" id="quizContainer"></div>
        </div>
    `;

    contentInner.innerHTML = html;
    document.getElementById('startQuizBtn').addEventListener('click', startQuiz);
}

/**
 * Start quiz - call AI to generate questions
 */
async function startQuiz() {
    const container = document.getElementById('quizContainer');
    if (!container || !currentSubject || !currentTopicId || !appData) return;

    const subject = appData.subjects[currentSubject];
    const topic = subject.topics.find(t => t.id === currentTopicId);
    if (!topic) return;

    const btn = document.getElementById('startQuizBtn');
    btn.disabled = true;
    btn.textContent = 'Generating Quiz...';

    try {
        const prompt = `You are a programming quiz generator.
Create a quiz for this topic:
SUBJECT: ${subject.name}
TOPIC: ${topic.title}
CONTEXT: ${topic.definition}

Return ONLY lines in this exact format, no extra text:
MCQ|question text|option 1|option 2|option 3|option 4|correctIndex
PRACTICAL|question text

Rules:
- Exactly 10 MCQ lines.
- Exactly 10 PRACTICAL lines.
- all mcqs questions must be different dont give same.
- all practical questions must be different dont give same.
- correctIndex is 0, 1, 2, or 3 (the index of the correct option).`;

        const content = await callGemini(prompt);

        const lines = content
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0);

        let mcqLines = lines.filter(l => l.toUpperCase().startsWith('MCQ|'));
        let practicalLines = lines.filter(l => l.toUpperCase().startsWith('PRACTICAL|'));

        // Remove duplicate MCQs by question text
        const seenMcqQuestions = new Set();
        mcqLines = mcqLines.filter(line => {
            const parts = line.split('|');
            const q = (parts[1] || '').trim();
            if (!q || seenMcqQuestions.has(q.toLowerCase())) return false;
            seenMcqQuestions.add(q.toLowerCase());
            return true;
        }).slice(0, 10);

        // Remove duplicate practicals by question text
        const seenPracticalQuestions = new Set();
        practicalLines = practicalLines.filter(line => {
            const parts = line.split('|');
            const q = (parts[1] || '').trim();
            if (!q || seenPracticalQuestions.has(q.toLowerCase())) return false;
            seenPracticalQuestions.add(q.toLowerCase());
            return true;
        }).slice(0, 10);

        generatedMcqs = mcqLines.map(line => {
            const parts = line.split('|');
            // MCQ|q|o1|o2|o3|o4|idx
            const question = parts[1] || '';
            const options = parts.slice(2, 6);
            const idxRaw = parts[6] || '0';
            const correct = Math.min(3, Math.max(0, parseInt(idxRaw, 10) || 0));
            return { question, options, correct };
        });

        // If no PRACTICAL lines at all, generate simple defaults based on topic
        if (practicalLines.length === 0) {
            practicalLines = Array.from({ length: 10 }).map((_, i) =>
                `PRACTICAL|Write a simple example in ${subject.name} for topic "${topic.title}" (question ${i + 1}).`
            );
        }

        generatedPractical = practicalLines.map(line => {
            const parts = line.split('|');
            const question = parts[1] || '';
            return { question };
        });

        renderQuiz(container);

    } catch (err) {
        container.innerHTML = `
            <div class="quiz-error">
                <p><strong>Error:</strong> ${escapeHtml(err.message)}</p>
                <p>Make sure GEMINI_API_KEY is set in <code>script.js</code>. Get your key from the Google AI Studio dashboard.</p>
            </div>
        `;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Start Quiz';
    }
}

/**
 * Render quiz UI
 */
function renderQuiz(container) {
    let html = `
        <div class="quiz-parts">
            <h4 style="margin: 1.5rem 0 1rem; color: var(--accent-light);">Part A – MCQ Quiz (1 mark each)</h4>
            <div id="mcqList"></div>

            <h4 style="margin: 2rem 0 1rem; color: var(--accent-light);">Part B – Practical Questions (5 marks each)</h4>
            <div id="practicalList"></div>

            <button class="submit-quiz-btn" id="submitQuizBtn">Submit Quiz</button>
        </div>
    `;

    container.innerHTML = html;

    const mcqList = document.getElementById('mcqList');
    mcqList.innerHTML = generatedMcqs.map((q, i) => {
        const opts = (q.options || []).map((opt, j) => `
            <label class="mcq-option">
                <input type="radio" name="mcq-${i}" value="${j}">
                <span>${escapeHtml(opt)}</span>
            </label>
        `).join('');
        return `
            <div class="mcq-item">
                <div class="mcq-question">${i + 1}. ${escapeHtml(q.question)}</div>
                <div class="mcq-options">${opts}</div>
            </div>
        `;
    }).join('');

    const practicalList = document.getElementById('practicalList');
    practicalList.innerHTML = generatedPractical.map((q, i) => `
        <div class="practical-item">
            <div class="practical-question">${i + 1}. ${escapeHtml(q.question)} (5 marks)</div>
            <textarea class="practical-answer" data-index="${i}" placeholder="Write your code/answer here..."></textarea>
        </div>
    `).join('');

    document.getElementById('submitQuizBtn').addEventListener('click', submitQuiz);
}

/**
 * Submit quiz - evaluate MCQs locally, practical via AI
 */
async function submitQuiz() {
    const submitBtn = document.getElementById('submitQuizBtn');
    if (!submitBtn) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Evaluating...';

    const subject = appData.subjects[currentSubject];
    const topic = subject.topics.find(t => t.id === currentTopicId);

    // Score MCQs (1 mark each)
    let mcqScore = 0;
    generatedMcqs.forEach((q, i) => {
        const selected = document.querySelector(`input[name="mcq-${i}"]:checked`);
        if (selected && parseInt(selected.value, 10) === (q.correct || 0)) {
            mcqScore++;
        }
    });

    const maxMcq = generatedMcqs.length * 1;

    // Score practical via Gemini (0–5 each)
    let practicalScore = 0;
    const maxPractical = generatedPractical.length * 5;

    try {
        const qaLines = generatedPractical.map((q, i) => {
            const textarea = document.querySelector(`.practical-answer[data-index="${i}"]`);
            const ans = (textarea?.value || "").trim();
            return `${i + 1}. QUESTION: ${q.question}\n   ANSWER: ${ans}`;
        }).join("\n\n");

        const evalPrompt = `You are grading student C# / ASP.NET Core code answers.

SUBJECT: ${subject.name}
TOPIC: ${topic.title}

For each answer below, give a score from 0 to 5:
- 5 = completely correct and idiomatic
- 3-4 = mostly correct with small issues
- 1-2 = partially correct or major issues
- 0 = wrong, empty, or unrelated

QUESTIONS AND ANSWERS:
${qaLines}

Return ONLY one line with ${generatedPractical.length} scores separated by commas.
Example: 5,4,3,0,2,5,1,4,3,5`;

        const evalText = await callGemini(evalPrompt);
        const scoreParts = evalText
            .split(/,|\s+/)
            .map(s => s.trim())
            .filter(s => s.length > 0 && !isNaN(parseInt(s, 10)));

        const scores = scoreParts.slice(0, generatedPractical.length).map(s => parseInt(s, 10));

        practicalScore = scores
            .slice(0, generatedPractical.length)
            .map((s) => Math.min(5, Math.max(0, parseInt(s, 10) || 0)))
            .reduce((a, b) => a + b, 0);
    } catch (err) {
        console.error("Gemini evaluation failed:", err);
        practicalScore = 0;
    }

    // Totals
    const totalMax = maxMcq + maxPractical;
    const totalObtained = mcqScore + practicalScore;
    const percent = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : 0;

    let grade, gradeClass;
    if (percent >= 80) { grade = 'A'; gradeClass = 'grade-a'; }
    else if (percent >= 60) { grade = 'B'; gradeClass = 'grade-b'; }
    else if (percent >= 40) { grade = 'C'; gradeClass = 'grade-c'; }
    else { grade = 'F'; gradeClass = 'grade-fail'; }

    const pass = percent >= 40;

    const record = {
        subjectId: currentSubject,
        subjectName: subject.name,
        topicId: currentTopicId,
        topicName: topic.title,
        mcqScore,
        maxMcq,
        practicalScore,
        maxPractical,
        totalObtained,
        totalMax,
        percent,
        grade,
        pass,
        date: new Date().toISOString()
    };
    saveProgress(record);

    document.getElementById('resultTopic').textContent = topic.title;
    document.getElementById('resultMcq').textContent = `${mcqScore} / ${maxMcq}`;
    document.getElementById('resultPractical').textContent = `${practicalScore} / ${maxPractical}`;
    document.getElementById('resultTotal').textContent = `${totalObtained} / ${totalMax}`;
    document.getElementById('resultPercent').textContent = `${percent}%`;
    const gradeEl = document.getElementById('resultGrade');
    gradeEl.textContent = grade;
    gradeEl.className = 'result-value result-grade ' + gradeClass;
    document.getElementById('resultProgressBar').style.width = `${percent}%`;
    const passFailEl = document.getElementById('passFail');
    passFailEl.textContent = pass ? 'Congratulations! You Passed!' : 'Keep Practicing! You need 40% to pass.';
    passFailEl.className = pass ? 'pass-fail pass' : 'pass-fail fail';

    resultModal.style.display = 'flex';

    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Quiz';
}

// =============================================
// UTILITIES
// =============================================

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// =============================================
// LOCAL STORAGE
// =============================================

const STORAGE_KEY = 'codemaster_progress';

function saveProgress(record) {
    let list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const idx = list.findIndex(
        r => r.subjectId === record.subjectId && r.topicId === record.topicId
    );
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}
