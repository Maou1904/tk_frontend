module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        prompt: ['Prompt', 'sans-serif'],
        'plus-jakarta-sans': ['Plus Jakarta Sans', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      colors: {
        primary: 'var(--color-primary)',
        'primary-dark': 'var(--color-primary-dark)',
        'primary-darker': 'var(--color-primary-darker)',
        'primary-soft': 'var(--color-primary-soft)',
        danger: 'var(--color-danger)',
        'danger-soft': 'var(--color-danger-soft)',
        surface: 'var(--color-surface)',
        'surface-soft': 'var(--color-surface-soft)',
        'surface-strong': 'var(--color-surface-strong)',
        muted: 'var(--color-muted)',
        'muted-light': 'var(--color-muted-light)',
        base: 'var(--color-background)',
        white: 'var(--color-white)',
        shadow: 'var(--color-shadow)',
        'border-soft': 'var(--color-border-soft)',
        'border-surface': 'var(--color-border-surface)',
      },
      boxShadow: {
        'soft': '0 20px 60px var(--color-shadow)',
      },
    },
  },
  plugins: [],
};