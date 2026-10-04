import { legalConfig as c } from '../legalConfig';

export default function WhatsAppWidget() {
  if (!c.supportWhatsApp) return null;

  return (
    <a
      href={`https://wa.me/${c.supportWhatsApp}?text=${encodeURIComponent("Hello Sokoni Hub, I need some help.")}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Support on WhatsApp"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: '56px',
        height: '56px',
        backgroundColor: '#25D366',
        borderRadius: '50%',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        transition: 'transform 0.2s ease',
        cursor: 'pointer'
      }}
      onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
    >
      <svg width="32" height="32" viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg">
        <path d="M12.01 2.002c-5.522 0-9.998 4.477-9.998 9.999 0 1.968.557 3.86 1.621 5.485L2 22l4.635-1.528c1.554.981 3.377 1.526 5.375 1.526 5.52 0 9.997-4.477 9.997-9.997 0-5.522-4.477-9.999-9.997-9.999zm.002 16.59c-1.63 0-3.21-.456-4.577-1.3l-.328-.2-3.413 1.127 1.144-3.275-.226-.341a8.318 8.318 0 0 1-1.32-4.6 8.368 8.368 0 0 1 8.72-8.363 8.368 8.368 0 0 1 8.358 8.362 8.369 8.369 0 0 1-8.358 8.59zM16.632 13.91c-.255-.13-1.492-.74-1.724-.824-.23-.083-.4-.13-.568.13-.17.258-.65 8.24-.799.99-.148.167-.297.188-.553.056a6.837 6.837 0 0 1-2.008-1.248 7.502 7.502 0 0 1-1.391-1.737c-.15-.258-.016-.398.112-.526.115-.115.256-.3.383-.45.13-.15.172-.258.258-.429.083-.172.042-.323-.021-.452-.064-.13-.568-1.37-.777-1.874-.203-.493-.41-.426-.568-.434-.148-.008-.32-.01-.49-.01a.936.936 0 0 0-.677.315c-.233.256-.893.874-.893 2.13 0 1.258.914 2.472 1.042 2.645.13.17 1.776 2.768 4.301 3.86 2.12.915 2.508.73 2.94.69.432-.042 1.401-.573 1.597-1.127.198-.555.198-1.03.139-1.13-.058-.098-.228-.154-.482-.284z"/>
      </svg>
    </a>
  );
}
