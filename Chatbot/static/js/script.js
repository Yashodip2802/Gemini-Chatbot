/**
 * Gemini Support Chatbot - Modern Frontend Script
 * Powered by GSAP 3, Locomotive Scroll, Marked.js, and Web Speech API
 */

// DOM Elements
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatBox = document.getElementById("chatBox");
const chatScrollContainer = document.getElementById("chatScrollContainer");
const voiceBtn = document.getElementById("voiceBtn");
const ttsToggle = document.getElementById("ttsToggle");
const themeSwitchBtn = document.getElementById("themeSwitchBtn");
const btnToggleSidebar = document.getElementById("btnToggleSidebar");
const btnCloseSidebar = document.getElementById("btnCloseSidebar");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const sidebarSessions = document.getElementById("sidebarSessions");
const sessionSearchInput = document.getElementById("sessionSearchInput");
const welcomeHero = document.getElementById("welcomeHero");

let ttsEnabled = false;
let recognizer = null;
let listening = false;
let micStream = null;
let allSessions = [];
let locoScroll = null;

// ==========================================================================
// 1. INITIALIZATION & GSAP ENTRANCE ANIMATIONS
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initLocomotiveScroll();
    initGSAPEntrance();
    renderExistingMarkdownMessages();
    fetchUserSessions();
    initSpeechRecognition();
    setupEventListeners();
});

// Initialize Locomotive Scroll for smooth scrolling
function initLocomotiveScroll() {
    if (typeof LocomotiveScroll !== 'undefined' && chatScrollContainer) {
        try {
            locoScroll = new LocomotiveScroll({
                el: chatScrollContainer,
                smooth: true,
                multiplier: 1.0,
                smartphone: { smooth: false },
                tablet: { smooth: false }
            });
        } catch (e) {
            console.warn("Locomotive Scroll initialized in native mode:", e);
        }
    }
}

// Update scroll container position
function scrollToBottom(force = false) {
    if (!chatScrollContainer) return;
    setTimeout(() => {
        if (locoScroll) {
            locoScroll.update();
            const target = chatBox ? chatBox.scrollHeight : chatScrollContainer.scrollHeight;
            locoScroll.scrollTo('bottom', { duration: 600, disableLerp: force });
        } else {
            chatScrollContainer.scrollTo({
                top: chatScrollContainer.scrollHeight,
                behavior: force ? 'auto' : 'smooth'
            });
        }
    }, 50);
}

// GSAP Page Load Timeline
function initGSAPEntrance() {
    if (typeof gsap === 'undefined') return;

    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    // Sidebar items
    tl.from(".brand-wrapper, .btn-new-chat, .sidebar-search, .session-group-label", {
        y: -15,
        opacity: 0,
        duration: 0.6,
        stagger: 0.08
    });

    // Header Navbar
    tl.from(".chat-navbar", {
        y: -25,
        opacity: 0,
        duration: 0.6
    }, "-=0.4");

    // Welcome Hero
    if (welcomeHero) {
        tl.from(".hero-glow-badge, .hero-title, .hero-subtitle", {
            y: 25,
            opacity: 0,
            duration: 0.7,
            stagger: 0.12,
            ease: "back.out(1.3)"
        }, "-=0.3");

        tl.from(".suggestion-chip", {
            y: 30,
            opacity: 0,
            duration: 0.5,
            stagger: 0.08,
            ease: "back.out(1.2)"
        }, "-=0.3");
    }

    // Input Dock
    tl.from(".chat-dock", {
        y: 45,
        opacity: 0,
        duration: 0.8,
        ease: "power3.out"
    }, "-=0.4");
}

// Render raw markdown in initial bot messages
function renderExistingMarkdownMessages() {
    document.querySelectorAll(".msg-bubble.markdown-body").forEach(el => {
        const raw = el.getAttribute("data-raw-content") || el.innerText;
        if (typeof marked !== 'undefined') {
            el.innerHTML = marked.parse(raw);
            addCodeCopyButtons(el);
        }
    });
}

// ==========================================================================
// 2. THEME CONTROLLER WITH GSAP
// ==========================================================================
function initTheme() {
    const isLight = localStorage.getItem("theme") === "light";
    if (isLight) {
        document.body.classList.add("light");
        if (themeSwitchBtn) {
            themeSwitchBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
        }
    }
}

if (themeSwitchBtn) {
    themeSwitchBtn.addEventListener("click", () => {
        const isLight = document.body.classList.toggle("light");
        localStorage.setItem("theme", isLight ? "light" : "dark");

        if (typeof gsap !== 'undefined') {
            gsap.fromTo(themeSwitchBtn, 
                { rotate: 0, scale: 0.8 }, 
                { rotate: 360, scale: 1, duration: 0.5, ease: "back.out(1.5)" }
            );
        }

        themeSwitchBtn.innerHTML = isLight 
            ? '<i class="fa-solid fa-sun"></i>' 
            : '<i class="fa-solid fa-moon"></i>';
    });
}

// ==========================================================================
// 3. SIDEBAR & SESSION HISTORY
// ==========================================================================
async function fetchUserSessions() {
    if (!sidebarSessions) return;
    try {
        const res = await fetch("/api/session/user", { credentials: "include" });
        if (!res.ok) throw new Error("Could not fetch sessions");
        allSessions = await res.json();
        renderSessionList(allSessions);
    } catch (err) {
        sidebarSessions.innerHTML = `
            <div style="color:var(--text-dim);font-size:0.85rem;padding:0.75rem 0.5rem;">
                No previous conversations.
            </div>
        `;
    }
}

function renderSessionList(sessions) {
    if (!sidebarSessions) return;
    if (!sessions || sessions.length === 0) {
        sidebarSessions.innerHTML = `
            <div style="color:var(--text-dim);font-size:0.85rem;padding:0.75rem 0.5rem;">
                No conversations yet.
            </div>
        `;
        return;
    }

    sidebarSessions.innerHTML = "";
    sessions.forEach(s => {
        const isActive = (s.session_id === currentSessionId);
        const item = document.createElement("a");
        item.href = `/chat/${s.session_id}/`;
        item.className = `session-item ${isActive ? 'active' : ''}`;
        item.title = s.title || "Untitled Chat";
        item.innerHTML = `
            <i class="fa-regular fa-message"></i>
            <span class="session-title">${escapeHtml(s.title || "Untitled Chat")}</span>
        `;
        sidebarSessions.appendChild(item);
    });

    if (typeof gsap !== 'undefined') {
        gsap.from(".session-item", {
            x: -12,
            opacity: 0,
            duration: 0.35,
            stagger: 0.04,
            ease: "power2.out"
        });
    }
}

// Session Search Filter
if (sessionSearchInput) {
    sessionSearchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = allSessions.filter(s => (s.title || "").toLowerCase().includes(query));
        renderSessionList(filtered);
    });
}

// Sidebar Mobile Toggle
function toggleSidebar(open) {
    if (!sidebar) return;
    const shouldOpen = open !== undefined ? open : !sidebar.classList.contains("open");
    sidebar.classList.toggle("open", shouldOpen);
    if (sidebarOverlay) sidebarOverlay.classList.toggle("active", shouldOpen);
}

if (btnToggleSidebar) btnToggleSidebar.addEventListener("click", () => toggleSidebar());
if (sidebarOverlay) sidebarOverlay.addEventListener("click", () => toggleSidebar(false));
if (btnCloseSidebar) btnCloseSidebar.addEventListener("click", () => toggleSidebar(false));

// ==========================================================================
// 4. SPEECH RECOGNITION (MIC) & TTS
// ==========================================================================
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition || !voiceBtn) return;

    recognizer = new SpeechRecognition();
    recognizer.lang = "en-US";
    recognizer.continuous = true;
    recognizer.interimResults = true;

    recognizer.onstart = () => {
        listening = true;
        voiceBtn.classList.add("listening");
    };

    recognizer.onend = () => {
        listening = false;
        voiceBtn.classList.remove("listening");
    };

    recognizer.onresult = (event) => {
        let text = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
            text += event.results[i][0].transcript;
        }
        userInput.value = text.trim();
        if (event.results[event.results.length - 1].isFinal) {
            setTimeout(() => {
                chatForm.requestSubmit();
                stopListening();
            }, 400);
        }
    };

    recognizer.onerror = () => stopListening();

    voiceBtn.addEventListener("click", () => {
        listening ? stopListening() : startListening();
    });
}

function startListening() {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            micStream = stream;
            recognizer.start();
        })
        .catch(() => stopListening());
}

function stopListening() {
    if (recognizer && listening) recognizer.stop();
    if (micStream) micStream.getTracks().forEach(t => t.stop());
    micStream = null;
    listening = false;
    if (voiceBtn) voiceBtn.classList.remove("listening");
}

function speakText(text) {
    if (!ttsEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    // Strip markdown formatting for cleaner speech synthesis
    const cleanText = text.replace(/[#*`_~\[\]()>-]/g, '').trim();
    const utter = new SpeechSynthesisUtterance(cleanText);
    utter.lang = "en-US";
    window.speechSynthesis.speak(utter);
}

if (ttsToggle) {
    ttsToggle.addEventListener("click", () => {
        ttsEnabled = !ttsEnabled;
        ttsToggle.classList.toggle("active", ttsEnabled);
        if (typeof gsap !== 'undefined') {
            gsap.fromTo(ttsToggle, { scale: 0.8 }, { scale: 1, duration: 0.3, ease: "back.out(2)" });
        }
    });
}

// ==========================================================================
// 5. MESSAGE RENDERING & CODE COPY
// ==========================================================================
function formatTime() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
    return (str || '').replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

function addCodeCopyButtons(container) {
    container.querySelectorAll("pre").forEach(pre => {
        if (pre.querySelector(".code-copy-btn")) return;
        const btn = document.createElement("button");
        btn.className = "code-copy-btn";
        btn.type = "button";
        btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
        btn.addEventListener("click", () => {
            const code = pre.querySelector("code") ? pre.querySelector("code").innerText : pre.innerText;
            navigator.clipboard.writeText(code).then(() => {
                btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                setTimeout(() => { btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy'; }, 2000);
            });
        });
        pre.appendChild(btn);
    });
}

function addMessage(content, sender, isMarkdown = false) {
    // Hide welcome hero if first message
    if (welcomeHero && welcomeHero.style.display !== "none") {
        if (typeof gsap !== 'undefined') {
            gsap.to(welcomeHero, {
                opacity: 0,
                y: -20,
                duration: 0.35,
                onComplete: () => { welcomeHero.style.display = "none"; }
            });
        } else {
            welcomeHero.style.display = "none";
        }
    }

    const wrapper = document.createElement("div");
    wrapper.classList.add("msg-wrapper", sender);

    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.innerHTML = sender === "user" 
        ? '<i class="fa-solid fa-user"></i>' 
        : '<i class="fa-solid fa-wand-magic-sparkles"></i>';

    const container = document.createElement("div");
    container.className = "msg-bubble-container";

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";

    if (sender === "bot" && (isMarkdown || typeof marked !== 'undefined')) {
        bubble.classList.add("markdown-body");
        bubble.innerHTML = marked.parse(content);
        addCodeCopyButtons(bubble);
        if (typeof hljs !== 'undefined') {
            bubble.querySelectorAll('pre code').forEach((el) => {
                hljs.highlightElement(el);
            });
        }
    } else {
        bubble.textContent = content;
    }

    const timestamp = document.createElement("div");
    timestamp.className = "msg-timestamp";
    timestamp.textContent = formatTime();

    container.appendChild(bubble);
    container.appendChild(timestamp);

    wrapper.appendChild(container);
    wrapper.appendChild(avatar);

    chatBox.appendChild(wrapper);

    // GSAP message reveal
    if (typeof gsap !== 'undefined') {
        gsap.from(wrapper, {
            y: 20,
            opacity: 0,
            scale: 0.96,
            duration: 0.38,
            ease: sender === "user" ? "power2.out" : "back.out(1.2)"
        });
    }

    scrollToBottom();
    return wrapper;
}

function addTypingIndicator() {
    const wrapper = document.createElement("div");
    wrapper.id = "typingIndicator";
    wrapper.classList.add("msg-wrapper", "bot");

    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';

    const container = document.createElement("div");
    container.className = "msg-bubble-container";

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.innerHTML = `
        <div class="typing-dots">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;

    container.appendChild(bubble);
    wrapper.appendChild(avatar);
    wrapper.appendChild(container);

    chatBox.appendChild(wrapper);

    if (typeof gsap !== 'undefined') {
        gsap.from(wrapper, { y: 15, opacity: 0, duration: 0.25, ease: "power2.out" });
    }

    scrollToBottom();
    return wrapper;
}

// ==========================================================================
// 6. FORM SUBMISSION & API INTERACTION
// ==========================================================================
function setupEventListeners() {
    // Suggested Prompt Chips
    document.querySelectorAll(".suggestion-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const prompt = chip.getAttribute("data-prompt");
            if (prompt) {
                userInput.value = prompt;
                if (typeof gsap !== 'undefined') {
                    gsap.fromTo(chip, { scale: 0.95 }, { scale: 1, duration: 0.2 });
                }
                setTimeout(() => chatForm.requestSubmit(), 150);
            }
        });
    });

    // Chat Form Submit
    if (chatForm) {
        chatForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const msg = userInput.value.trim();
            if (!msg) return;

            addMessage(msg, "user");
            userInput.value = "";

            const typing = addTypingIndicator();

            const isFirstMessage = (!currentSessionId || currentSessionId === "None");
            const url = isFirstMessage 
                ? "/api/chat/new/chat" 
                : `/api/chat/${currentSessionId}/chat`;

            try {
                const res = await fetch(url, {
                    method: "POST",
                    credentials: 'include',
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRFToken": getCookie("csrftoken"),
                        "X-Requested-With": "XMLHttpRequest"
                    },
                    body: JSON.stringify({ message: msg })
                });

                const data = await res.json();
                typing.remove();

                if (res.ok && data.response) {
                    if (isFirstMessage && data.session_id) {
                        currentSessionId = data.session_id;
                        document.getElementById("currentSessionId").value = currentSessionId;
                        history.pushState({}, '', `/chat/${currentSessionId}/`);
                        
                        // Update title & fetch sessions
                        const headerTitle = document.getElementById("headerSessionTitle");
                        if (headerTitle) headerTitle.textContent = msg.slice(0, 25);
                        fetchUserSessions();
                    }

                    addMessage(data.response, "bot", true);
                    if (ttsEnabled) speakText(data.response);
                } else {
                    const errorMsg = (data && (data.error || data.message || data.detail)) || "Error: Could not get response.";
                    addMessage(errorMsg, "bot");
                }
            } catch (err) {
                typing.remove();
                addMessage("Network error. Please check your connection.", "bot");
                console.error(err);
            }
        });
    }
}

// CSRF Cookie Helper
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}
