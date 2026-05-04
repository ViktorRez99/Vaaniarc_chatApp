/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}", "*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        void: "var(--bg-void)",
        base: "var(--bg-base)",
        panel: "var(--bg-panel)",
        card: "var(--bg-card)",
        elevated: "var(--bg-elevated)",
        hover: "var(--bg-hover)",
        selected: "var(--bg-selected)",
        glass: "var(--bg-glass)",
        accent: {
          DEFAULT: "var(--accent)",
          dim: "var(--accent-dim)",
        },
        emerald: {
          neon: "var(--emerald)",
          dim: "var(--emerald-dim)",
        },
        danger: "var(--danger)",
        warning: "var(--warning)",
        success: "var(--success)",
        info: "var(--info)",
        e2ee: {
          secure: "var(--e2ee-secure)",
          quantum: "var(--e2ee-quantum)",
          broken: "var(--e2ee-broken)",
        },
        tx: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          disabled: "var(--text-disabled)",
        },
        bd: {
          subtle: "var(--border-subtle)",
          DEFAULT: "var(--border-default)",
          strong: "var(--border-strong)",
          accent: "var(--border-accent)",
        },
        background: "var(--bg-base)",
        foreground: "var(--text-primary)",
        muted: {
          DEFAULT: "var(--bg-hover)",
          foreground: "var(--text-secondary)",
        },
        popover: {
          DEFAULT: "var(--bg-elevated)",
          foreground: "var(--text-primary)",
        },
        primary: {
          DEFAULT: "var(--accent)",
          foreground: "var(--bg-void)",
        },
        secondary: {
          DEFAULT: "var(--bg-elevated)",
          foreground: "var(--text-primary)",
        },
        destructive: {
          DEFAULT: "var(--danger)",
          foreground: "#fff",
        },
        border: "var(--border-default)",
        input: "var(--border-default)",
        ring: "var(--accent)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        pill: "var(--radius-pill)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
        ui: ["var(--font-ui)"],
        sans: ["var(--font-body)"],
      },
      fontSize: {
        xs: ["var(--text-xs)", { lineHeight: "1.4" }],
        sm: ["var(--text-sm)", { lineHeight: "1.5" }],
        base: ["var(--text-base)", { lineHeight: "1.6" }],
        md: ["var(--text-md)", { lineHeight: "1.5" }],
        lg: ["var(--text-lg)", { lineHeight: "1.3" }],
        xl: ["var(--text-xl)", { lineHeight: "1.2" }],
        "2xl": ["var(--text-2xl)", { lineHeight: "1.1" }],
      },
      spacing: {
        1: "var(--space-1)",
        2: "var(--space-2)",
        3: "var(--space-3)",
        4: "var(--space-4)",
        5: "var(--space-5)",
        6: "var(--space-6)",
        8: "var(--space-8)",
        10: "var(--space-10)",
        12: "var(--space-12)",
      },
      transitionTimingFunction: {
        "out-expo": "var(--ease-out-expo)",
        "spring": "var(--ease-spring)",
        "in-back": "var(--ease-in-back)",
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
        slow: "var(--duration-slow)",
      },
      boxShadow: {
        glow: "var(--accent-glow)",
        "glow-lg": "var(--accent-glow-lg)",
        "emerald-glow": "var(--emerald-glow)",
        modal: "0 32px 80px rgba(0,0,0,0.8), 0 0 1px rgba(255,255,255,0.05)",
      },
      backdropBlur: {
        glass: "24px",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [],
};
