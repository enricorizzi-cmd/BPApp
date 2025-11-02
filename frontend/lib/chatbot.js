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

  const overlay = document.createElement('div');
  overlay.id = 'chatbot-modal-overlay';
  overlay.className = 'chatbot-modal-overlay';
  
  overlay.innerHTML = `
    <div class="chatbot-modal">
      <div class="chatbot-modal-header">
        <h2 class="chatbot-modal-title">🤖 Assistente AI</h2>
        <button class="chatbot-modal-close" aria-label="Chiudi">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      
      <div class="chatbot-messages" id="chatbot-messages">
        <div class="chatbot-message chatbot-message-assistant">
          <div class="chatbot-message-content">
            Ciao! Sono il tuo assistente AI. Posso aiutarti ad analizzare i dati della tua attività commerciale, 
            rispondere a domande su appuntamenti, clienti, vendite, KPI e molto altro. Cosa vorresti sapere?
          </div>
        </div>
      </div>
      
      <div class="chatbot-input-container">
        <input 
          type="text" 
          id="chatbot-input" 
          class="chatbot-input" 
          placeholder="Scrivi una domanda..."
          autocomplete="off"
        />
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

  // Event listeners
  const closeBtn = overlay.querySelector('.chatbot-modal-close');
  const sendBtn = overlay.querySelector('#chatbot-send');
  const input = overlay.querySelector('#chatbot-input');
  const messagesContainer = overlay.querySelector('#chatbot-messages');

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

