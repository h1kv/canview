window.tailwind = window.tailwind || {};
window.tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      colors: {
        portfolio: {
          bg: '#f8fafc',
          surface: '#ffffff',
          text: '#1e293b',
          accent: '#2563eb',
          accentHover: '#1d4ed8',
          muted: '#64748b',
          border: '#e2e8f0',
          skillBg: '#e0e7ef',
          footerBg: '#f1f5f9'
        }
      },
      borderRadius: {
        portfolio: '12px',
        portfolioSm: '6px'
      },
      boxShadow: {
        portfolio: '0 2px 12px rgba(30,41,59,0.08)'
      }
    }
  }
};


