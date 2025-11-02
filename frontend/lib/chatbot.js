/**
 * Chatbot AI Component
 * FAB button e modal per interagire con il chatbot AI
 */

import { POST } from '../src/api.js';
import { getUser } from '../src/auth.js';
import { toast } from '../modules/notifications.js';

let chatbotInitialized = false;
let conversationHistory = [];

/**
 * Salva la history della conversazione in sessionStorage
 */
function saveConversationHistory(userId) {
  try {
    const key = `chatbot_history_${userId}`;
    sessionStorage.setItem(key, JSON.stringify(conversationHistory));
  } catch (error) {
    console.warn('[Chatbot] Failed to save conversation history:', error);
  }
}

/**
 * Carica la history della conversazione da sessionStorage
 */
function loadConversationHistory(userId) {
  try {
    const key = `chatbot_history_${userId}`;
    const saved = sessionStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      conversationHistory = Array.isArray(parsed) ? parsed : [];
      return conversationHistory;
    }
  } catch (error) {
    console.warn('[Chatbot] Failed to load conversation history:', error);
  }
  return [];
}

/**
 * Resetta la history della conversazione
 */
function resetConversationHistory(userId) {
  conversationHistory = [];
  try {
    const key = `chatbot_history_${userId}`;
    sessionStorage.removeItem(key);
  } catch (error) {
    console.warn('[Chatbot] Failed to reset conversation history:', error);
  }
}

/**
 * Inizializza il chatbot (FAB button)
 */
export function initChatbot() {
  if (chatbotInitialized) return;
  
  const user = getUser();
  if (!user) return;

  // Crea FAB button se non esiste
  if (!document.getElementById('chatbot-fab')) {
    createFAB();
  }

  chatbotInitialized = true;
}

/**
 * Crea il FAB button
 */
function createFAB() {
  const fab = document.createElement('button');
  fab.id = 'chatbot-fab';
  fab.className = 'chatbot-fab';
  fab.setAttribute('aria-label', 'Apri chatbot AI');
  fab.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 18H11V16H13V18ZM13 14H11C10.99 11.24 12.75 11.24 12.75 9C12.75 7.76 11.99 7 10.75 7C9.51 7 8.75 7.76 8.75 9H6.75C6.75 6.65 8.65 4.75 11 4.75C13.35 4.75 15.25 6.65 15.25 9C15.25 11.04 13.5 12.79 13 14Z" fill="currentColor"/>
    </svg>
  `;
  
  fab.addEventListener('click', () => {
    openChatbotModal();
  });

  document.body.appendChild(fab);
}

/**
 * Apre il modal del chatbot
 */
function openChatbotModal() {
  // Rimuovi modal esistente se presente
  const existing = document.getElementById('chatbot-modal-overlay');
  if (existing) {
    existing.remove();
  }

  const user = getUser();
  if (!user) return;

  // Carica history salvata
  const savedHistory = loadConversationHistory(user.id);
  if (savedHistory.length > 0) {
    conversationHistory = savedHistory;
  } else {
    conversationHistory = [];
  }

  const overlay = document.createElement('div');
  overlay.id = 'chatbot-modal-overlay';
  overlay.className = 'chatbot-modal-overlay';
  
  overlay.innerHTML = `
    <div class="chatbot-modal">
      <div class="chatbot-modal-header">
        <h2 class="chatbot-modal-title">🤖 Assistente AI</h2>
        <div class="chatbot-header-actions">
          <button id="chatbot-reset" class="chatbot-reset-button" aria-label="Resetta chat" title="Resetta conversazione">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
              <path d="M21 3v5h-5"></path>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
              <path d="M3 21v-5h5"></path>
            </svg>
          </button>
          <button class="chatbot-modal-close" aria-label="Chiudi">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="chatbot-messages" id="chatbot-messages">
        ${conversationHistory.length === 0 ? `
        <div class="chatbot-message chatbot-message-assistant">
          <div class="chatbot-message-content">
            Ciao! Sono il tuo assistente AI. Posso aiutarti ad analizzare i dati della tua attività commerciale, 
            rispondere a domande su appuntamenti, clienti, vendite, KPI e molto altro. Cosa vorresti sapere?
          </div>
        </div>
        ` : ''}
      </div>
      
      <div class="chatbot-input-container">
        <input 
          type="text" 
          id="chatbot-input" 
          class="chatbot-input" 
          placeholder="Scrivi una domanda..."
          autocomplete="off"
        />
        <button id="chatbot-voice" class="chatbot-voice-button" aria-label="Dettatura vocale" title="Dettatura vocale">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        </button>
        <button id="chatbot-send" class="chatbot-send-button" aria-label="Invia">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Carica messaggi salvati se esistono
  if (conversationHistory.length > 0) {
    conversationHistory.forEach(msg => {
      if (msg.role === 'user' || msg.role === 'assistant') {
        addMessage(msg.content, msg.role);
      }
    });
    // Scroll to bottom
    setTimeout(() => {
      const container = document.getElementById('chatbot-messages');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 100);
  }

  // Event listeners
  const closeBtn = overlay.querySelector('.chatbot-modal-close');
  const resetBtn = overlay.querySelector('#chatbot-reset');
  const sendBtn = overlay.querySelector('#chatbot-send');
  const voiceBtn = overlay.querySelector('#chatbot-voice');
  const input = overlay.querySelector('#chatbot-input');
  const messagesContainer = overlay.querySelector('#chatbot-messages');

  // Reset conversazione
  resetBtn.addEventListener('click', () => {
    if (confirm('Vuoi resettare la conversazione? Tutti i messaggi verranno eliminati.')) {
      resetConversationHistory(user.id);
      conversationHistory = [];
      messagesContainer.innerHTML = `
        <div class="chatbot-message chatbot-message-assistant">
          <div class="chatbot-message-content">
            Ciao! Sono il tuo assistente AI. Posso aiutarti ad analizzare i dati della tua attività commerciale, 
            rispondere a domande su appuntamenti, clienti, vendite, KPI e molto altro. Cosa vorresti sapere?
          </div>
        </div>
      `;
      toast('Conversazione resettata', 'info');
    }
  });

  // Inizializza Speech Recognition se disponibile
  let recognition = null;
  let isListening = false;
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const hasSpeechSupport = !!SpeechRecognition;
  
  if (hasSpeechSupport) {
    try {
      recognition = new SpeechRecognition();
      recognition.lang = 'it-IT';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        isListening = true;
        voiceBtn.classList.add('chatbot-voice-active');
        voiceBtn.setAttribute('aria-label', 'In ascolto...');
        input.placeholder = 'Sto ascoltando...';
      };

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        // Aggiorna input con testo dettato
        // Pulisci prima eventuale testo provvisorio
        let currentValue = input.value.replace(/\s*\[.*?\]\s*/g, ' ').trim();
        
        if (finalTranscript) {
          // Aggiungi testo finale
          input.value = (currentValue + ' ' + finalTranscript).trim();
          currentValue = input.value; // Aggiorna per evitare duplicati
        }
        
        // Mostra trascrizione provvisoria in tempo reale
        if (interimTranscript) {
          input.value = currentValue + (currentValue ? ' ' : '') + '[' + interimTranscript + ']';
        }
      };

      recognition.onerror = (event) => {
        console.error('[Chatbot] Speech recognition error:', event.error);
        isListening = false;
        voiceBtn.classList.remove('chatbot-voice-active');
        voiceBtn.setAttribute('aria-label', 'Dettatura vocale');
        input.placeholder = 'Scrivi una domanda...';
        
        if (event.error === 'no-speech') {
          toast('Nessun parlato rilevato', 'info');
        } else if (event.error === 'audio-capture') {
          toast('Microfono non disponibile', 'error');
        } else if (event.error === 'not-allowed') {
          toast('Permesso microfono negato', 'error');
        } else {
          toast('Errore dettatura vocale', 'error');
        }
      };

      recognition.onend = () => {
        isListening = false;
        voiceBtn.classList.remove('chatbot-voice-active');
        voiceBtn.setAttribute('aria-label', 'Dettatura vocale');
        input.placeholder = 'Scrivi una domanda...';
        
        // Pulisci testo provvisorio (rimuovi [testo])
        const currentValue = input.value;
        const cleaned = currentValue.replace(/\s*\[.*?\]\s*/g, ' ').trim();
        if (cleaned !== input.value) {
          input.value = cleaned;
          // Piccolo feedback visivo
          input.style.borderColor = 'var(--accent)';
          setTimeout(() => {
            input.style.borderColor = '';
          }, 500);
        }
      };
    } catch (error) {
      console.error('[Chatbot] Failed to initialize speech recognition:', error);
      hasSpeechSupport = false;
    }
  }

  // Gestione pulsante voce
  if (hasSpeechSupport) {
    voiceBtn.addEventListener('click', () => {
      if (isListening) {
        // Ferma la dettatura
        recognition.stop();
      } else {
        try {
          // Avvia la dettatura
          input.focus();
          recognition.start();
          if (window.haptic) window.haptic('light');
        } catch (error) {
          console.error('[Chatbot] Error starting speech recognition:', error);
          toast('Impossibile avviare la dettatura vocale', 'error');
        }
      }
    });
  } else {
    // Nascondi pulsante se non supportato
    voiceBtn.style.display = 'none';
  }

  // Chiudi modal
  closeBtn.addEventListener('click', () => {
    overlay.remove();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });

  // Invio messaggio
  function sendMessage() {
    const message = input.value.trim();
    if (!message) return;

    // Aggiungi messaggio utente
    addMessage(message, 'user');
    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;

    // Mostra indicatore di caricamento
    const loadingId = addMessage('Sto pensando...', 'assistant', true);

    // Invia al backend
    POST('/api/chatbot/query', {
      message: message,
      conversationHistory: conversationHistory
    })
      .then(data => {
        // Rimuovi loading e aggiungi risposta
        removeMessage(loadingId);
        addMessage(data.response, 'assistant');

        // Aggiorna history
        conversationHistory.push(
          { role: 'user', content: message },
          { role: 'assistant', content: data.response }
        );

        // Limita history a ultimi 20 messaggi
        if (conversationHistory.length > 20) {
          conversationHistory = conversationHistory.slice(-20);
        }

        // Salva history in sessionStorage
        saveConversationHistory(user.id);
      })
      .catch(error => {
        removeMessage(loadingId);
        addMessage(
          error.message || 'Errore durante l\'elaborazione della richiesta. Riprova più tardi.',
          'assistant'
        );
        toast('Errore nel chatbot', 'error');
      })
      .finally(() => {
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
      });
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Focus input
  setTimeout(() => input.focus(), 100);
}

/**
 * Aggiunge un messaggio al container
 */
function addMessage(text, role, isTemporary = false) {
  const container = document.getElementById('chatbot-messages');
  if (!container) return null;

  const messageEl = document.createElement('div');
  const messageId = `msg-${Date.now()}-${Math.random()}`;
  messageEl.id = messageId;
  messageEl.className = `chatbot-message chatbot-message-${role}${isTemporary ? ' chatbot-message-loading' : ''}`;
  
  // Formatta il markdown solo per messaggi assistant (risposte AI)
  const formattedText = role === 'assistant' ? formatMarkdown(text) : escapeHtml(text);
  
  messageEl.innerHTML = `
    <div class="chatbot-message-content">${formattedText}</div>
  `;

  container.appendChild(messageEl);
  container.scrollTop = container.scrollHeight;

  return messageId;
}

/**
 * Rimuove un messaggio dal container
 */
function removeMessage(messageId) {
  const messageEl = document.getElementById(messageId);
  if (messageEl) {
    messageEl.remove();
  }
}

/**
 * Escape HTML per sicurezza
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Formatta markdown semplice in HTML (grassetto, liste, ecc.)
 * Sicura: escapa tutto tranne i tag markdown supportati
 */
function formatMarkdown(text) {
  if (!text || typeof text !== 'string') return '';
  
  // Prima escapa tutto per sicurezza
  let html = escapeHtml(text);
  
  // Converti **testo** in <strong>testo</strong> (grassetto)
  html = html.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  
  // Converti *testo* in <em>testo</em> (corsivo) - solo quelli rimanenti (non doppi)
  // Usa un pattern che non matcha se c'è un asterisco prima o dopo (già convertito in strong)
  html = html.replace(/([^*])\*([^*\n]+?)\*([^*])/g, '$1<em>$2</em>$3');
  
  // Converti liste numerate: 1. item o 1) item
  html = html.replace(/^(\d+[.)]\s+.+)$/gm, '<div style="margin: 4px 0;">$1</div>');
  
  // Converti liste puntate: - item o * item
  html = html.replace(/^[-*]\s+(.+)$/gm, '<div style="margin: 4px 0;">• $1</div>');
  
  // Converti break lines multipli in paragrafi
  html = html.replace(/\n\n+/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p><\/p>/g, ''); // Rimuovi paragrafi vuoti
  
  return html;
}

// Auto-inizializza quando l'utente è loggato
if (typeof window !== 'undefined') {
  // Funzione per inizializzare dopo che il DOM è pronto
  function checkAndInit() {
    if (getUser()) {
      initChatbot();
    }
  }

  // Se il DOM è già caricato
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(checkAndInit, 500);
    });
  } else {
    setTimeout(checkAndInit, 500);
  }

  // Esponi globalmente per chiamata manuale dopo login
  window.initChatbot = initChatbot;
}

