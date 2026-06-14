declare global {
  interface Window {
    __gramtreeVConsoleEnabled?: boolean;
  }
}

export async function enableMobileVConsole() {
  if (typeof window === "undefined" || window.__gramtreeVConsoleEnabled) return;

  const VConsole = (await import("vconsole")).default;
  new VConsole();
  window.__gramtreeVConsoleEnabled = true;
}
