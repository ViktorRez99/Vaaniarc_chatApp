export const easeOutExpo = [0.16, 1, 0.3, 1];
export const easeInBack = [0.36, 0, 0.66, -0.56];

export const pageTransition = {
  initial: { opacity: 0, x: 12 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -12 },
  transition: { duration: 0.22, ease: easeOutExpo },
};

export const pageExitTransition = {
  opacity: 0,
  x: -12,
  transition: { duration: 0.18 },
};

export const messageAppear = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: easeOutExpo },
};

export const messageSending = {
  sending: { opacity: 0.6 },
  sent: { opacity: 1, scale: [1.02, 1], transition: { duration: 0.2 } },
};

export const sidebarSpring = {
  type: "spring",
  stiffness: 300,
  damping: 30,
};

export const modalOverlay = {
  initial: { opacity: 0 },
  animate: { opacity: 0.7 },
  exit: { opacity: 0 },
  transition: { duration: 0.18 },
};

export const modalContent = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
  transition: { duration: 0.2, ease: easeOutExpo },
};

export const commandPalette = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
  transition: { duration: 0.18, ease: easeOutExpo },
};

export const toastSlide = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.25, ease: easeOutExpo },
};

export const hoverActions = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 4 },
  transition: { duration: 0.15 },
};

export const controlsBar = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 24 },
  transition: { duration: 0.3, ease: easeOutExpo },
};

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.22 },
};

export const slideInLeft = {
  initial: { opacity: 0, x: -12 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -12 },
  transition: { duration: 0.22, ease: easeOutExpo },
};

export const slideInRight = {
  initial: { opacity: 0, x: 12 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 12 },
  transition: { duration: 0.22, ease: easeOutExpo },
};

export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.04,
    },
  },
};

export const staggerItem = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.18, ease: easeOutExpo },
};

export const scaleIn = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.9 },
  transition: { duration: 0.2, ease: easeOutExpo },
};
