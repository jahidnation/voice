(() => {
  if (!document.querySelector('link[href*="font-awesome"]')) {
    const fontAwesomeLink = document.createElement("link");
    fontAwesomeLink.rel = "stylesheet";
    fontAwesomeLink.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css";
    document.head.appendChild(fontAwesomeLink);
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isRecording = false;
  let currentTarget = null;
  let toastTimer = null;
  let currentLang = localStorage.getItem("uvt_lang") || "bn-BD";
  let currentMode = localStorage.getItem("uvt_mode") || "normal";

  const toastElement = document.createElement("div");
  toastElement.className = "uvt-toast";
  document.body.appendChild(toastElement);

  const showToast = (message, type = "info") => {
    clearTimeout(toastTimer);
    const iconClass = type === "success" ? "fa-circle-check" : type === "error" ? "fa-circle-exclamation" : "fa-circle-info";
    toastElement.className = `uvt-toast uvt-toast-${type} uvt-show`;
    toastElement.innerHTML = `<i class="fa-solid ${iconClass}"></i><span>${message}</span>`;
    toastTimer = setTimeout(() => {
      toastElement.classList.remove("uvt-show");
    }, 2800);
  };

  const translateText = async (text, fromLang, toLang) => {
    if (!text) return text;
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=${toLang}&dt=t&q=${encodeURIComponent(text)}`;
      const response = await fetch(url);
      if (!response.ok) return text;
      const data = await response.json();
      if (data && data[0]) {
        return data[0].map((item) => item[0]).filter(Boolean).join("");
      }
      return text;
    } catch {
      return text;
    }
  };

  const formatBanglaPunctuation = (rawText) => {
    if (!rawText) return "";
    let s = rawText.normalize("NFC").trim();

    s = s.replace(/(^|\s)(কমা|comma)($|\s)/gi, "$1,$2");
    s = s.replace(/(^|\s)(দাঁড়ি|দাড়ি|ফুলস্টপ|ফুল স্টপ|full stop)($|\s)/gi, "$1।$2");
    s = s.replace(/(^|\s)(প্রশ্নবোধক|প্রশ্নচিহ্ন|কোশ্চেন মার্ক|question mark)($|\s)/gi, "$1?$2");

    s = s.replace(/(^|\s)(ঠিক আছে|আচ্ছা|আসলে|শুনুন|শোনো|দেখুন|দেখো|যাইহোক|যাই হোক|হ্যাঁ|না|অবশ্যই|ধন্যবাদ|হ্যালো|হাই)(?=\s|$)/gi, "$1$2,");
    s = s.replace(/(^|\s)(কিন্তু|তবে|তাহলে|সুতরাং|নাহলে|নতুবা|অথবা|কারণ)(?=\s)/gi, ", $2");
    s = s.replace(/\s+(তাই না|নাকি|হবে তো|পারবেন তো|পারবে তো|আছেন তো|আছো তো)($|[।?!,])/gi, ", $1?");

    const isQuestion = /(^|\s)(কি|কী|কেন|কোথায়|কোথাও|কখন|কেমন|কে|কার|কাকে|কিসের|কত|কবে|কিভাবে|কই|নাকি)($|\s|[।?!,])/i.test(s) || /\?$/.test(s);

    if (!/[।?!]$/.test(s)) {
      s = s.replace(/[,]+$/, "");
      s += isQuestion ? "?" : "।";
    }

    s = s.replace(/\s+([,।?!])/g, "$1");
    s = s.replace(/([,।?!])(?=[^\s,।?!])/g, "$1 ");
    s = s.replace(/,+/g, ",");
    s = s.replace(/\s{2,}/g, " ");
    return s.trim();
  };

  const formatEnglishPunctuation = (rawText) => {
    if (!rawText) return "";
    let s = rawText.trim();
    s = s.replace(/(^|\s)(comma)($|\s)/gi, "$1,$2");
    s = s.replace(/(^|\s)(period|full stop)($|\s)/gi, "$1.$2");
    s = s.replace(/(^|\s)(question mark)($|\s)/gi, "$1?$2");
    s = s.replace(/(^|\s)(ok|okay|well|actually|yes|no|hello|hi|hey|sure|please)(?=\s|$)/gi, (m, p1, p2) => p1 + p2.charAt(0).toUpperCase() + p2.slice(1).toLowerCase() + ",");
    s = s.replace(/\s+(right|isn't it|aren't you|won't you)($|[.?!,])/gi, ", $1?");
    const isQuestion = /(^|\s)(what|why|when|where|who|whom|whose|which|how|is|are|am|do|does|did|can|could|will|would|should)($|\s)/i.test(s) || /\?$/.test(s);
    if (!/[.?!]$/.test(s)) {
      s = s.replace(/[,]+$/, "");
      s += isQuestion ? "?" : ".";
    }
    s = s.charAt(0).toUpperCase() + s.slice(1);
    s = s.replace(/\s+([,.?!])/g, "$1");
    s = s.replace(/([,.?!])(?=[^\s,.?!])/g, "$1 ");
    s = s.replace(/,+/g, ",");
    s = s.replace(/\s{2,}/g, " ");
    return s.trim();
  };

  const getTargetElement = () => {
    if (currentTarget && document.contains(currentTarget)) {
      return currentTarget;
    }
    const active = document.activeElement;
    if (
      active &&
      (active.tagName === "TEXTAREA" ||
        (active.tagName === "INPUT" && !["button", "checkbox", "radio", "submit", "file", "image"].includes(active.type)) ||
        active.isContentEditable)
    ) {
      return active;
    }
    return document.querySelector('textarea, [contenteditable="true"], input[type="text"]');
  };

  const insertText = (target, text) => {
    if (!target || !text) return;
    target.focus();
    if ("value" in target) {
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? target.value.length;
      const prefix = start > 0 && !/\s$/.test(target.value.slice(0, start)) ? " " : "";
      const textToInsert = prefix + text;
      target.setRangeText(textToInsert, start, end, "end");
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (target.isContentEditable) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        document.execCommand("insertText", false, ` ${text}`);
      } else {
        target.innerText += ` ${text}`;
      }
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };

  const setupRecognition = () => {
    if (!SpeechRecognition) {
      showToast("Web Speech API not supported in this browser.", "error");
      return null;
    }
    const instance = new SpeechRecognition();
    instance.continuous = true;
    instance.interimResults = true;
    instance.maxAlternatives = 5;

    if (currentMode === "bn_to_en") {
      instance.lang = "bn-BD";
    } else if (currentMode === "en_to_bn") {
      instance.lang = "en-US";
    } else {
      instance.lang = currentLang;
    }

    instance.onstart = () => {
      isRecording = true;
      if (currentMode === "bn_to_en") {
        showToast("Listening: বাংলা ➔ English...", "info");
      } else if (currentMode === "en_to_bn") {
        showToast("Listening: English ➔ বাংলা...", "info");
      } else {
        showToast("Listening...", "info");
      }
    };

    instance.onresult = async (event) => {
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          let chosen = "";
          const isBanglaInput = currentMode === "bn_to_en" || (currentMode === "normal" && currentLang === "bn-BD");

          for (let j = 0; j < item.length; j++) {
            const candidate = item[j].transcript.trim();
            if (isBanglaInput && /[\u0980-\u09FF]/.test(candidate)) {
              chosen = candidate;
              break;
            }
          }
          if (!chosen && item.length > 0) {
            chosen = item[0].transcript.trim();
          }

          if (chosen) {
            let processedText = chosen;
            if (currentMode === "bn_to_en") {
              const translated = await translateText(processedText, "bn", "en");
              processedText = formatEnglishPunctuation(translated);
            } else if (currentMode === "en_to_bn") {
              const translated = await translateText(processedText, "en", "bn");
              processedText = formatBanglaPunctuation(translated);
            } else if (currentLang === "bn-BD") {
              processedText = formatBanglaPunctuation(processedText);
            } else {
              processedText = formatEnglishPunctuation(processedText);
            }

            const target = getTargetElement();
            if (target) {
              insertText(target, processedText);
            }
          }
        }
      }
    };

    instance.onerror = (event) => {
      if (event.error === "no-speech") return;
      stopRecording();
      showToast(`Speech error: ${event.error}`, "error");
    };

    instance.onend = () => {
      if (isRecording) {
        stopRecording();
      }
    };

    return instance;
  };

  const startRecording = () => {
    const target = getTargetElement();
    if (!target) {
      showToast("Please click inside an input box first.", "error");
      return;
    }
    currentTarget = target;
    if (recognition) {
      try {
        recognition.abort();
      } catch {}
    }
    recognition = setupRecognition();
    if (!recognition) return;
    try {
      recognition.start();
    } catch {
      recognition.stop();
    }
  };

  const stopRecording = () => {
    isRecording = false;
    if (recognition) {
      try {
        recognition.stop();
      } catch {}
    }
    showToast("Listening stopped", "success");
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  document.addEventListener("focusin", (e) => {
    const el = e.target;
    if (
      el &&
      (el.tagName === "TEXTAREA" ||
        (el.tagName === "INPUT" && !["button", "checkbox", "radio", "submit", "file", "image"].includes(el.type)) ||
        el.isContentEditable)
    ) {
      currentTarget = el;
    }
  }, true);

  document.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "l" || e.key === "L")) {
      e.preventDefault();
      if (currentMode === "normal") {
        currentLang = currentLang === "bn-BD" ? "en-US" : "bn-BD";
        localStorage.setItem("uvt_lang", currentLang);
        showToast(`Language: ${currentLang === "bn-BD" ? "Bangla" : "English"}`, "info");
      } else {
        currentMode = currentMode === "bn_to_en" ? "en_to_bn" : "bn_to_en";
        localStorage.setItem("uvt_mode", currentMode);
        showToast(`Mode: ${currentMode === "bn_to_en" ? "বাংলা ➔ English" : "English ➔ বাংলা"}`, "info");
      }
      if (isRecording) {
        stopRecording();
        setTimeout(() => startRecording(), 250);
      }
    } else if (e.altKey && (e.key === "v" || e.key === "V")) {
      e.preventDefault();
      toggleRecording();
    }
  });

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "toggleRecording") {
        toggleRecording();
        sendResponse({ isRecording, currentLang, currentMode });
      } else if (request.action === "setLanguage") {
        currentLang = request.lang;
        currentMode = "normal";
        localStorage.setItem("uvt_lang", currentLang);
        localStorage.setItem("uvt_mode", currentMode);
        showToast(`Language: ${currentLang === "bn-BD" ? "Bangla" : "English"}`, "info");
        sendResponse({ isRecording, currentLang, currentMode });
      } else if (request.action === "setMode") {
        currentMode = request.mode;
        localStorage.setItem("uvt_mode", currentMode);
        const modeLabel = currentMode === "bn_to_en" ? "বাংলা ➔ English" : currentMode === "en_to_bn" ? "English ➔ বাংলা" : "Normal";
        showToast(`Mode: ${modeLabel}`, "info");
        if (isRecording) {
          stopRecording();
          setTimeout(() => startRecording(), 250);
        }
        sendResponse({ isRecording, currentLang, currentMode });
      } else if (request.action === "getStatus") {
        sendResponse({ isRecording, currentLang, currentMode });
      }
      return true;
    });
  }
})();